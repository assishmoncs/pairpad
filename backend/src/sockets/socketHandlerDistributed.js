const Message = require('../models/Message');
const Room = require('../models/Room');
const logger = require('../utils/logger');
const { getUserFromToken } = require('../utils/tokenAuth');
const { findRoomByCode, isRoomParticipant, normalizeRoomCode, getRoomRole } = require('../utils/roomAccess');
const { canEdit } = require('../utils/roomPermissions');
const redisPresence = require('../services/redisPresenceServiceV2');

const roomPresence = new Map();
const MAX_CODE_SIZE = 512 * 1024;
const SOCKET_WINDOW_MS = 60 * 1000;
const SOCKET_MAX_CONNECTIONS = 20;
const connectionAttempts = new Map();
const EVENT_RATE_WINDOW_MS = 60 * 1000;
const EVENT_RATE_LIMITS = { 'code-change': 120, 'chat-message': 30, 'cursor-update': 300 };
const snapshotTimers = new Map();
const SNAPSHOT_DEBOUNCE_MS = 500;
const PRESENCE_HEARTBEAT_MS = 30000;

setInterval(() => {
  const windowStart = Date.now() - SOCKET_WINDOW_MS;
  for (const [ip, attempts] of connectionAttempts.entries()) {
    const valid = attempts.filter((time) => time >= windowStart);
    if (valid.length) connectionAttempts.set(ip, valid);
    else connectionAttempts.delete(ip);
  }
}, 5 * 60 * 1000).unref();

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
const getLocalPresence = (roomCode) => {
  if (!roomPresence.has(roomCode)) roomPresence.set(roomCode, new Map());
  return roomPresence.get(roomCode);
};

const listPresence = async (roomCode) => {
  const shared = await redisPresence.list(roomCode);
  if (shared) return shared;
  return Array.from(getLocalPresence(roomCode).values());
};

const broadcastPresence = async (io, roomCode) => {
  const users = await listPresence(roomCode);
  io.to(`room:${roomCode}`).emit('presence-update', { users });
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

const handleLeaveRoom = async (io, socket) => {
  if (!socket.currentRoom) return;
  const roomCode = socket.currentRoom;
  flushSnapshot(socket.id);

  const local = getLocalPresence(roomCode);
  local.delete(socket.id);
  await redisPresence.remove(roomCode, socket.id);

  socket.leave(`room:${roomCode}`);
  socket.to(`room:${roomCode}`).emit('user-left', socketIdentity(socket));
  await broadcastPresence(io, roomCode);
  if (!local.size) roomPresence.delete(roomCode);
  if (socket._presenceTimer) clearInterval(socket._presenceTimer);
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
        if (socket.currentRoom && socket.currentRoom !== normalized) await handleLeaveRoom(io, socket);

        socket.join(`room:${normalized}`);
        socket.currentRoom = normalized;
        const identity = { ...socketIdentity(socket), socketId: socket.id };
        getLocalPresence(normalized).set(socket.id, identity);
        await redisPresence.upsert(normalized, socket.id, identity);

        socket.to(`room:${normalized}`).emit('user-joined', socketIdentity(socket));
        await broadcastPresence(io, normalized);

        socket._presenceTimer = setInterval(async () => {
          if (!socket.currentRoom) return;
          try { await redisPresence.refresh(socket.currentRoom, socket.id); } catch (error) { logger.warn('Presence heartbeat failed', { message: error.message }); }
        }, PRESENCE_HEARTBEAT_MS);
        socket._presenceTimer.unref?.();

        const users = await listPresence(normalized);
        callback?.({
          success: true,
          room: { roomCode: normalized, name: room.name, language: room.language },
          users,
          role: getRoomRole(room, socket.user._id),
        });
      } catch (error) {
        logger.error('Error joining room', { message: error.message });
        callback?.({ error: 'Failed to join room.' });
      }
    });

    socket.on('leave-room', () => { void handleLeaveRoom(io, socket); });

    socket.on('code-change', async (data, callback) => {
      try {
        if (!socket.currentRoom) return callback?.({ error: 'Not in a room.' });
        if (!checkEventRate(socket, 'code-change')) return callback?.({ error: 'Rate limit exceeded. Please slow down.' });
        const room = await findRoomByCode(socket.currentRoom);
        if (!room || !canEdit(getRoomRole(room, socket.user._id))) return callback?.({ error: 'Editor permission required.' });
        const { content, language } = data || {};
        if (typeof content !== 'string') return callback?.({ error: 'Content is required.' });
        if (Buffer.byteLength(content, 'utf8') > MAX_CODE_SIZE) return callback?.({ error: 'Code payload exceeds the maximum size.' });
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

    socket.on('disconnect', () => { void handleLeaveRoom(io, socket); });
  });
};

module.exports = initializeSocket;
