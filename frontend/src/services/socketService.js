import { io } from 'socket.io-client';

/** Socket service for PairPad real-time collaboration. */
const FORWARDED_EVENTS = [
  'presence-update',
  'user-joined',
  'user-left',
  'code-change',
  'cursor-update',
  'chat-message',
  'code-execution-result',
  'room-deleted',
  'interview-updated',
  'interview-state-changed',
  'workspace-file-created',
  'workspace-file-renamed',
  'workspace-file-deleted',
  'member-role-updated',
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
  connect(token) {
    if (this.socket?.connected) {
      this.emitEvent('connect');
      return this.socket;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.3,
      timeout: CONNECT_TIMEOUT_MS,
    });
    this.socket.on('connect', () => {
      this.connected = true;
      this.emitEvent('connect');
    });
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this.emitEvent('disconnect', { reason });
    });
    this.socket.on('connect_error', (error) => {
      this.connected = false;
      this.emitEvent('connect_error', { error: error?.message || String(error) });
    });
    FORWARDED_EVENTS.forEach((event) =>
      this.socket.on(event, (data) => this.emitEvent(event, data))
    );
    return this.socket;
  }
  waitForConnection(timeoutMs = CONNECT_TIMEOUT_MS) {
    if (this.isConnected()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        offConnect();
        offDisconnect();
        fn(arg);
      };
      const timeoutId = window.setTimeout(
        () => finish(reject, new Error('Timed out connecting to collaboration server.')),
        timeoutMs
      );
      const offConnect = this.on('connect', () => finish(resolve));
      const offDisconnect = this.on('disconnect', ({ reason } = {}) => {
        if (reason === 'io server disconnect' || reason === 'io client disconnect')
          finish(reject, new Error(reason || 'Disconnected from collaboration server.'));
      });
    });
  }
  disconnect() {
    if (!this.socket) return;
    this.leaveRoom();
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.connected = false;
    this.currentRoom = null;
    this.clearListeners();
  }
  emitWithAck(event, payload, { requirement } = {}) {
    return new Promise((resolve, reject) => {
      const requirementError = requirement?.();
      if (requirementError) return reject(new Error(requirementError));
      if (!this.socket) return reject(new Error('Socket not initialised.'));
      this.socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (ackError, response) => {
        if (ackError) return reject(new Error('No acknowledgement from collaboration server.'));
        if (response?.error) return reject(new Error(response.error));
        return resolve(response);
      });
    });
  }
  requireConnection = () => (this.socket?.connected ? null : 'Not connected to server');
  requireRoom = () => (this.currentRoom ? null : 'Not in a room');
  async joinRoom(roomCode) {
    const response = await this.emitWithAck(
      'join-room',
      { roomCode },
      { requirement: this.requireConnection }
    );
    this.currentRoom = response.room?.roomCode || roomCode.toUpperCase();
    return response;
  }
  leaveRoom() {
    if (this.currentRoom) {
      this.socket?.emit('leave-room');
      this.currentRoom = null;
    }
  }
  sendCodeChange(content, language) {
    return this.emitWithAck(
      'code-change',
      { content, language },
      { requirement: this.requireRoom }
    );
  }
  sendCursorUpdate(position, selection) {
    if (this.currentRoom) this.socket?.emit('cursor-update', { position, selection });
  }
  sendChatMessage(content) {
    return this.emitWithAck('chat-message', { content }, { requirement: this.requireRoom });
  }
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }
  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }
  emitEvent(event, data) {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Socket] Error in listener for ${event}:`, error);
      }
    });
  }
  clearListeners() {
    this.listeners.clear();
  }
  isConnected() {
    return this.connected && !!this.socket?.connected;
  }
  getCurrentRoom() {
    return this.currentRoom;
  }
}

const socketService = new SocketService();
export default socketService;
