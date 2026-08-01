import { io } from 'socket.io-client';

/**
 * Socket service for PairPad real-time collaboration.
 * Manages Socket.IO connection, authentication, and room events.
 */

// Server events forwarded as-is to subscribers of this service
const FORWARDED_EVENTS = [
  'presence-update',
  'user-joined',
  'user-left',
  'code-change',
  'cursor-update',
  'chat-message',
  'code-execution-result',
  'room-deleted',
];

const ACK_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 10000;

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.currentRoom = null;
    this.listeners = new Map();
  }

  /**
   * Connect to Socket.IO server with JWT token.
   *
   * Safe to call multiple times:
   * - If already connected with same socket, does nothing.
   * - If a stale/closed socket exists it is torn down first.
   *
   * NOTE: All subscriber listeners (socketService.on(...)) MUST be
   * registered BEFORE calling this method so that the 'connect' event
   * is never missed on fast connections.
   *
   * @param {string} token - JWT authentication token
   */
  connect(token) {
    // Nothing to do if already live
    if (this.socket?.connected) {
      console.log('[Socket] Already connected');
      // Re-emit connect so late-registered Room listeners catch up
      this.emitEvent('connect');
      return;
    }

    // Tear down any stale socket before creating a new one
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      // Preserve currentRoom so the caller can re-join after connect
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      // Retry indefinitely so transient network gaps are recovered automatically.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      // Cap the exponential back-off at 10 s so we never wait longer than that.
      reconnectionDelayMax: 10000,
      // Randomise back-off slightly to prevent thundering-herd when many tabs reconnect.
      randomizationFactor: 0.3,
      timeout: CONNECT_TIMEOUT_MS,
    });

    // ── connect ──────────────────────────────────────────────────────────────
    // Just mark ourselves connected and let callers know.
    // Auto-rejoin is intentionally NOT done here — that is Room's responsibility
    // via its own 'connect' subscriber, which has the full room context.
    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket.id);
      this.connected = true;
      this.emitEvent('connect');
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.connected = false;
      this.emitEvent('disconnect', { reason });
    });

    // ── connect_error ────────────────────────────────────────────────────────
    // Normalize to a plain string so subscribers never deal with Error objects.
    // We do NOT reject waitForConnection here — transient errors are handled by
    // Socket.IO's built-in retry; waitForConnection uses its own timeout.
    this.socket.on('connect_error', (error) => {
      const msg = error?.message || String(error) || 'Connection error';
      console.error('[Socket] Connection error:', msg);
      this.connected = false;
      this.emitEvent('connect_error', { error: msg });
    });

    // ── forwarded server events ───────────────────────────────────────────────
    FORWARDED_EVENTS.forEach((event) => {
      this.socket.on(event, (data) => {
        this.emitEvent(event, data);
      });
    });

    return this.socket;
  }

  /**
   * Wait until the socket is connected, up to `timeoutMs` milliseconds.
   *
   * Unlike the previous version this does NOT reject on connect_error.
   * Socket.IO will keep retrying after transient errors; we only give up
   * when the timeout expires.
   *
   * @param {number} [timeoutMs]
   * @returns {Promise<void>}
   */
  waitForConnection(timeoutMs = CONNECT_TIMEOUT_MS) {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const done = (fn, arg) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        offConnect();
        offDisconnect();
        fn(arg);
      };

      const timeoutId = window.setTimeout(() => {
        done(reject, new Error('Timed out connecting to collaboration server.'));
      }, timeoutMs);

      // Resolve as soon as the socket declares itself connected.
      const offConnect = this.on('connect', () => done(resolve));

      // Reject immediately only on clean disconnects (i.e. the server actively
      // refused the connection after Socket.IO gave up all retries).
      const offDisconnect = this.on('disconnect', ({ reason } = {}) => {
        // 'transport close' / 'io server disconnect' indicate the server closed us.
        // 'io client disconnect' is an intentional local disconnect — reject too.
        // Transient disconnects during reconnection should not reject here because
        // the 'connect' event will fire again on the next successful attempt.
        if (
          reason === 'io server disconnect' ||
          reason === 'io client disconnect'
        ) {
          done(reject, new Error(reason || 'Disconnected from collaboration server.'));
        }
        // Otherwise just wait — reconnection is in progress.
      });
    });
  }

  /**
   * Disconnect from Socket.IO server and clean up all state.
   */
  disconnect() {
    if (this.socket) {
      this.leaveRoom();
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.currentRoom = null;
      this.clearListeners();
    }
  }

  /**
   * Emit an event and resolve with the server acknowledgement.
   * @param {string} event - Event name
   * @param {object} payload - Event payload
   * @param {{requirement: () => string|null}} [options] - Precondition producing an error message
   * @returns {Promise<object>}
   * @private
   */
  emitWithAck(event, payload, { requirement } = {}) {
    return new Promise((resolve, reject) => {
      const requirementError = requirement?.();
      if (requirementError) {
        return reject(new Error(requirementError));
      }

      if (!this.socket) {
        return reject(new Error('Socket not initialised.'));
      }

      this.socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (ackError, response) => {
        if (ackError) {
          reject(new Error('No acknowledgement from collaboration server.'));
          return;
        }

        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  /** Error message when the socket is not connected yet. */
  requireConnection = () => (this.socket?.connected ? null : 'Not connected to server');

  /** Error message when the socket has not joined a room yet. */
  requireRoom = () => (this.currentRoom ? null : 'Not in a room');

  /**
   * Join a room by room code.
   * @param {string} roomCode - Room code to join
   * @returns {Promise<object>} Server acknowledgement with { room, users }
   */
  async joinRoom(roomCode) {
    const response = await this.emitWithAck(
      'join-room',
      { roomCode },
      { requirement: this.requireConnection }
    );

    this.currentRoom = response.room?.roomCode || roomCode.toUpperCase();
    return response;
  }

  /**
   * Leave the current room.
   */
  leaveRoom() {
    if (this.currentRoom) {
      this.socket?.emit('leave-room');
      this.currentRoom = null;
    }
  }

  /**
   * Send code change to other room members.
   * @param {string} content - Editor content
   * @param {string} language - Programming language
   * @returns {Promise<object>}
   */
  sendCodeChange(content, language) {
    return this.emitWithAck(
      'code-change',
      { content, language },
      { requirement: this.requireRoom }
    );
  }

  /**
   * Send cursor position update (fire-and-forget).
   * @param {object} position - Cursor position { line, column }
   * @param {object} [selection] - Selection range
   */
  sendCursorUpdate(position, selection) {
    if (!this.currentRoom) return;
    this.socket?.emit('cursor-update', { position, selection });
  }

  /**
   * Send a chat message.
   * @param {string} content - Message content
   * @returns {Promise<object>}
   */
  sendChatMessage(content) {
    return this.emitWithAck('chat-message', { content }, { requirement: this.requireRoom });
  }

  /**
   * Subscribe to socket events.
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Unsubscribe from socket events.
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit event to all registered listeners.
   * @private
   */
  emitEvent(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Socket] Error in listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Clear all listeners (called on full disconnect).
   */
  clearListeners() {
    this.listeners.clear();
  }

  /**
   * Returns true when the socket is both logically and physically connected.
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && !!this.socket?.connected;
  }

  /**
   * Get the current room code.
   * @returns {string|null}
   */
  getCurrentRoom() {
    return this.currentRoom;
  }
}

// Singleton instance shared across the whole frontend
const socketService = new SocketService();

export default socketService;
