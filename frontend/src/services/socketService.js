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
];

const ACK_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 5000;

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.currentRoom = null;
    this.listeners = new Map();
  }

  /**
   * Connect to Socket.IO server with JWT token
   * @param {string} token - JWT authentication token
   */
  connect(token) {
    if (this.socket?.connected) {
      console.log('[Socket] Already connected');
      return;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.currentRoom = null;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', async () => {
      console.log('[Socket] Connected to server');
      this.connected = true;

      if (this.currentRoom) {
        try {
          const response = await this.joinRoom(this.currentRoom);
          if (response?.users) {
            this.emitEvent('presence-update', { users: response.users });
          }
        } catch (err) {
          console.error('[Socket] Failed to rejoin room on reconnect:', err.message);
          this.currentRoom = null;
          this.emitEvent('connect_error', { error: 'Failed to rejoin room after reconnect.' });
        }
      }

      this.emitEvent('connect');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.connected = false;
      this.emitEvent('disconnect', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      this.connected = false;
      this.emitEvent('connect_error', { error: error.message });
    });

    // Presence, code synchronization, cursor and chat events
    FORWARDED_EVENTS.forEach((event) => {
      this.socket.on(event, (data) => {
        this.emitEvent(event, data);
      });
    });

    return this.socket;
  }

  waitForConnection(timeoutMs = CONNECT_TIMEOUT_MS) {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Timed out connecting to collaboration server.'));
      }, timeoutMs);

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        offConnect();
        offError();
        offDisconnect();
      };

      const offConnect = this.on('connect', () => {
        cleanup();
        resolve();
      });
      const offError = this.on('connect_error', ({ error }) => {
        cleanup();
        reject(new Error(error || 'Failed to connect to collaboration server.'));
      });
      const offDisconnect = this.on('disconnect', ({ reason } = {}) => {
        cleanup();
        reject(new Error(reason || 'Disconnected from collaboration server.'));
      });
    });
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect() {
    if (this.socket) {
      this.leaveRoom();
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

      this.socket?.timeout(ACK_TIMEOUT_MS).emit(event, payload, (ackError, response) => {
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
   * Join a room by room code
   * @param {string} roomCode - Room code to join
   * @returns {Promise}
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
   * Leave current room
   */
  leaveRoom() {
    if (this.currentRoom) {
      this.socket?.emit('leave-room');
      this.currentRoom = null;
    }
  }

  /**
   * Send code change to other room members
   * @param {string} content - Editor content
   * @param {string} language - Programming language
   * @returns {Promise}
   */
  sendCodeChange(content, language) {
    return this.emitWithAck(
      'code-change',
      { content, language },
      { requirement: this.requireRoom }
    );
  }

  /**
   * Send cursor position update
   * @param {object} position - Cursor position { line, column }
   * @param {object} selection - Selection range (optional)
   */
  sendCursorUpdate(position, selection) {
    if (!this.currentRoom) return;

    this.socket?.emit('cursor-update', { position, selection });
  }

  /**
   * Send chat message
   * @param {string} content - Message content
   * @returns {Promise}
   */
  sendChatMessage(content) {
    return this.emitWithAck('chat-message', { content }, { requirement: this.requireRoom });
  }

  /**
   * Subscribe to socket events
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Unsubscribe from socket events
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit event to all listeners
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
   * Clear all listeners
   */
  clearListeners() {
    this.listeners.clear();
  }

  /**
   * Get connection status
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && this.socket?.connected;
  }

  /**
   * Get current room code
   * @returns {string|null}
   */
  getCurrentRoom() {
    return this.currentRoom;
  }
}

// Singleton instance
const socketService = new SocketService();

export default socketService;
