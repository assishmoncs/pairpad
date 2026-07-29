import { io } from 'socket.io-client';

/**
 * Socket service for PairPad real-time collaboration.
 * Manages Socket.IO connection, authentication, and room events.
 */

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

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server');
      this.connected = true;
      this.emitEvent('connect');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.connected = false;
      this.emitEvent('disconnect', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      this.emitEvent('connect_error', { error: error.message });
    });

    // Presence updates
    this.socket.on('presence-update', (data) => {
      this.emitEvent('presence-update', data);
    });

    this.socket.on('user-joined', (data) => {
      this.emitEvent('user-joined', data);
    });

    this.socket.on('user-left', (data) => {
      this.emitEvent('user-left', data);
    });

    // Code synchronization
    this.socket.on('code-change', (data) => {
      this.emitEvent('code-change', data);
    });

    // Cursor updates
    this.socket.on('cursor-update', (data) => {
      this.emitEvent('cursor-update', data);
    });

    // Chat messages
    this.socket.on('chat-message', (data) => {
      this.emitEvent('chat-message', data);
    });

    return this.socket;
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
   * Join a room by room code
   * @param {string} roomCode - Room code to join
   * @returns {Promise}
   */
  joinRoom(roomCode) {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error('Not connected to server'));
      }

      this.socket.emit(
        'join-room',
        { roomCode },
        (response) => {
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            this.currentRoom = response.room?.roomCode || roomCode.toUpperCase();
            resolve(response);
          }
        }
      );
    });
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
    return new Promise((resolve, reject) => {
      if (!this.currentRoom) {
        return reject(new Error('Not in a room'));
      }

      this.socket?.emit(
        'code-change',
        { content, language },
        (response) => {
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        }
      );
    });
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
    return new Promise((resolve, reject) => {
      if (!this.currentRoom) {
        return reject(new Error('Not in a room'));
      }

      this.socket?.emit(
        'chat-message',
        { content },
        (response) => {
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        }
      );
    });
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
