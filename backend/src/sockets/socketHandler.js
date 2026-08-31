const Message = require('../models/Message');
const Room = require('../models/Room');
const logger = require('../utils/logger');
const { getUserFromToken } = require('../utils/tokenAuth');
const { findRoomByCode, isRoomParticipant, normalizeRoomCode, getRoomRole } = require('../utils/roomAccess');
const { canEdit } = require('../utils/roomPermissions');

const roomPresence = new Map();
const MAX_CODE_SIZE = 512 * 1024;
const SOCKET_WINDOW_MS = 60 * 1000;
const SOCKET_MAX_CONNECTIONS = 20;
const connectionAttempts = new Map();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const EVENT_RATE_WINDOW_MS = 60 * 1000;
const EVENT_RATE_LIMITS = { 'code-change': 120, 'chat-message': 30, 'cursor-update': 300 };
const snapshotTimers = new Map();
const SNAPSHOT_DEBOUNCE_MS = 500;

setInterval(() => {
  const windowStart = Date.now() - SOCKET_WINDOW_MS;
  for (const [ip, attempts] of connectionAttempts.entries()) {
    const valid = attempts.filter((t) => t >= windowStart);
    if (valid.length) connectionAttempts.set(ip, valid);
    else connectionAttempts.delete(ip);
  }
}, CLEANUP_INTERVAL_MS).unref();

function enforceConnectionLimit(socket, next) {
  const ip = socket.handshake?.address || 'unknown';
  const now = Date.now();
  const valid = (connectionAttempts.get(ip) || []).filter((time) => time >= now - SOCKET_WINDOW_MS);
  if (valid.length >= SOCKET_MAX_CONNECTIONS) return next(new Error('Too many connections. Please try again later.'));
  valid.push(now);
  connectionAttempts.set(ip, valid);
  next();
}

function checkEventRate(socket, event) {
  const limit = EVENT_RATE_LIMITS[event];
  if (!limit) return true;
  const now = Date.now();
  const key = `_rate_${event}`;
  const timestamps = (socket[key] || []).filter((time) => time >= now - EVENT_RATE_WINDOW_MS);
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  socket[key] = timestamps;
  return true;
}

const socketIdentity = (socket) => ({ userId: socket.user._id.toString(), name: socket.user.name });
const getRoomPresence = (roomCode) => {
  if (!roomPresence.has(roomCode)) roomPresence.set(roomCode, new Map());
  return roomPresence.get(roomCode);
};
const broadcastPresence = (io, roomCode) => {
  io.to(`room:${roomCode}`).emit('presence-update', { users: Array.from(getRoomPresence(roomCode).values()) });
};

function flushSnapshot(socketId) {
  const entry = snapshotTimers.get(socketId);
  if (!entry) return;
  snapshotTimers.delete(socketId);
  Room.updateOne({ roomCode: entry.roomCode }, { $set: { snapshotCode: entry.content } })
    .catch((err) => logger.error('Failed to persist legacy snapshot', { message: err.message }));
}

function scheduleSnapshot(socket, roomCode, content) {
  const previous = snapshotTimers.get(socket.id);
  if (previous) clearTimeout(previous.timer);
  snapshotTimers.set(socket.id, { roomCode, content, timer: setTimeout(() => flushSnapshot(socket.id), SNAPSHOT_DEBOUNCE_MS) });
}

const handleLeaveRoom = (io, socket) => {
  if (!socket.currentRoom) return;
  const roomCode = socket.currentRoom;
  flushSnapshot(socket.id);
  const presence = getRoomPresence(roomCode);
  presence.delete(socket.id);
  socket.leave(`room:${roomCode}`);
  socket.to(`room:${roomCode}`).emit('user-left', socketIdentity(socket));
  broadcastPresence(io, roomCode);
  if (!presence.size) roomPresence.delete(roomCode);
  socket.currentRoom = null;
};

const initializeSocket = (io) => {
  io.use(enforceConnectionLimit);
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required.'));
    try {
      const user = await getUserFromToken(token);
      if (!user) return next(new Error('Invalid or expired token.'));
      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error', { message: error.message });
      next(new Error('Authentication service error.'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-room', async (data, callback) => {
      try {
        const normalized = normalizeRoomCode(data?.roomCode);
        if (!normalized) return callback?.({ error: 'A valid room code is required.' });
        const room = await findRoomByCode(normalized);
        if (!room) return callback?.({ error: 'Room not found.' });
        if (!isRoomParticipant(room, socket.user._id)) return callback?.({ error: 'You are not authorized to join this room.' });
        if (socket.currentRoom && socket.currentRoom !== normalized) handleLeaveRoom(io, socket);

        socket.join(`room:${normalized}`);
        socket.currentRoom = normalized;
        const presence = getRoomPresence(normalized);
        presence.set(socket.id, { ...socketIdentity(socket), socketId: socket.id });
        socket.to(`room:${normalized}`).emit('user-joined', socketIdentity(socket));
        broadcastPresence(io, normalized);

        callback?.({
          success: true,
          room: { roomCode: normalized, name: room.name, language: room.language },
          users: Array.from(presence.values()),
          role: getRoomRole(room, socket.user._id),
        });
      } catch (error) {
        logger.error('Error joining room', { message: error.message });
        callback?.({ error: 'Failed to join room.' });
      }
    });

    socket.on('leave-room', () => handleLeaveRoom(io, socket));

    socket.on('code-change', async (data, callback) => {
      try {
        if (!socket.currentRoom) return callback?.({ error: 'Not in a room.' });
        if (!checkEventRate(socket, 'code-change')) return callback?.({ error: 'Rate limit exceeded. Please slow down.' });
        const room = await findRoomByCode(socket.currentRoom);
        if (!room || !canEdit(getRoomRole(room, socket.user._id))) return callback?.({ error: 'Editor permission required.' });
        const { content, language } = data || {};
        if (typeof content !== 'string') return callback?.({ error: 'Content is required.' });
        if (content.length > MAX_CODE_SIZE) return callback?.({ error: 'Code payload exceeds the maximum size.' });
        scheduleSnapshot(socket, socket.currentRoom, content);
        socket.to(`room:${socket.currentRoom}`).emit('code-change', { content, language, userId: socket.user._id.toString(), userName: socket.user.name });
        callback?.({ success: true });
      } catch (error) {
        logger.error('Error applying code change', { message: error.message });
        callback?.({ error: 'Failed to synchronize code.' });
      }
    });

    socket.on('cursor-update', async (data) => {
      if (!socket.currentRoom || !checkEventRate(socket, 'cursor-update')) return;
      const room = await findRoomByCode(socket.currentRoom);
      if (!room || !isRoomParticipant(room, socket.user._id)) return;
      const position = data?.position;
      if (!Number.isInteger(position?.line) || !Number.isInteger(position?.column) || position.line < 1 || position.column < 1) return;
      socket.to(`room:${socket.currentRoom}`).emit('cursor-update', { userId: socket.user._id.toString(), userName: socket.user.name, position, selection: data?.selection || null });
    });

    socket.on('chat-message', async (data, callback) => {
      try {
        if (!socket.currentRoom) return callback?.({ error: 'Not in a room.' });
        if (!checkEventRate(socket, 'chat-message')) return callback?.({ error: 'Rate limit exceeded. Please slow down.' });
        const room = await findRoomByCode(socket.currentRoom);
        if (!room || !isRoomParticipant(room, socket.user._id)) return callback?.({ error: 'Room membership required.' });
        const content = typeof data?.content === 'string' ? data.content.trim().slice(0, 1000) : '';
        if (!content) return callback?.({ error: 'Message content is required.' });
        const message = await Message.create({ room: room._id, sender: socket.user._id, content });
        const populated = await Message.findById(message._id).populate('sender', 'name email');
        const payload = { _id: populated._id.toString(), content: populated.content, sender: { _id: populated.sender._id.toString(), name: populated.sender.name, email: populated.sender.email || '' }, createdAt: populated.createdAt };
        io.to(`room:${socket.currentRoom}`).emit('chat-message', payload);
        callback?.({ success: true, message: payload });
      } catch (error) {
        logger.error('Error sending message', { message: error.message });
        callback?.({ error: 'Failed to send message.' });
      }
    });

    socket.on('disconnect', () => handleLeaveRoom(io, socket));
  });
};

module.exports = initializeSocket;
