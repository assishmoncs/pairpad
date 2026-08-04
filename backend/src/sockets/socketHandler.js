/**
 * Socket.IO handler for real-time collaboration in PairPad.
 *
 * Features:
 * - JWT authentication for socket connections
 * - Room-based channels for collaboration
 * - Code synchronization (full document sync for MVP)
 * - User presence tracking
 * - Chat message broadcasting and persistence
 * - Per-IP connection rate limiting and debounced snapshot persistence
 *
 * Limitations (MVP):
 * - Uses full document sync instead of CRDT/OT
 * - Last-write-wins conflict resolution
 * - Presence is in-memory (single-instance); use the Redis adapter for scaling
 */

const Message = require('../models/Message');
const Room = require('../models/Room');
const logger = require('../utils/logger');
const { getUserFromToken } = require('../utils/tokenAuth');
const {
  findRoomByCode,
  isRoomParticipant,
  normalizeRoomCode,
} = require('../utils/roomAccess');

// Store online users per room: { [roomCode]: Map<socketId, { userId, name, socketId }> }
const roomPresence = new Map();

const MAX_CODE_SIZE = 512 * 1024; // 512 KB max code payload

// ── Connection rate limiting ────────────────────────────────────────────────
const SOCKET_WINDOW_MS = 60 * 1000;
const SOCKET_MAX_CONNECTIONS = 20;
const connectionAttempts = new Map(); // ip -> number of attempts in window

// Clean up expired rate limiting IP records every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const windowStart = Date.now() - SOCKET_WINDOW_MS;
  for (const [ip, attempts] of connectionAttempts.entries()) {
    const valid = attempts.filter((t) => t >= windowStart);
    if (valid.length === 0) {
      connectionAttempts.delete(ip);
    } else {
      connectionAttempts.set(ip, valid);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

function enforceConnectionLimit(socket, next) {
  const ip = (socket.handshake && socket.handshake.address) || 'unknown';
  const now = Date.now();
  const windowStart = now - SOCKET_WINDOW_MS;

  // Prune expired entries periodically.
  const attempts = (connectionAttempts.get(ip) || []).filter((t) => t >= windowStart);
  if (attempts.length >= SOCKET_MAX_CONNECTIONS) {
    logger.warn('Socket connection rate limit exceeded', { ip });
    return next(new Error('Too many connections. Please try again later.'));
  }
  attempts.push(now);
  connectionAttempts.set(ip, attempts);
  next();
}

// ── Per-socket event rate limiting ──────────────────────────────────────────
const EVENT_RATE_WINDOW_MS = 60 * 1000;
const EVENT_RATE_LIMITS = {
  'code-change': 120,    // Max 120 code changes per minute (2/sec average)
  'chat-message': 30,    // Max 30 chat messages per minute
  'cursor-update': 300,  // Max 300 cursor updates per minute (5/sec)
};

function checkEventRate(socket, event) {
  if (!EVENT_RATE_LIMITS[event]) return true; // No limit configured

  if (!socket._eventCounts) socket._eventCounts = {};
  if (!socket._eventWindows) socket._eventWindows = {};

  const now = Date.now();
  const windowStart = now - EVENT_RATE_WINDOW_MS;

  // Reset counter if window has expired
  if (!socket._eventWindows[event] || socket._eventWindows[event] < windowStart) {
    socket._eventCounts[event] = 0;
    socket._eventWindows[event] = now;
  }

  socket._eventCounts[event]++;

  if (socket._eventCounts[event] > EVENT_RATE_LIMITS[event]) {
    logger.warn('Socket event rate limit exceeded', {
      event,
      socketId: socket.id,
      user: socket.user?.name,
    });
    return false;
  }

  return true;
}

/**
 * Authenticate socket connection via JWT token.
 * Returns null for absent/invalid tokens or unknown users, but lets
 * unexpected errors (e.g. database failures) propagate so they are not
 * masked as an "invalid token".
 */
const authenticateSocket = async (token) => {
  if (!token) {
    return null;
  }

  return (await getUserFromToken(token)) || null;
};

/**
 * Get or create presence map for a room
 */
const getRoomPresence = (roomCode) => {
  if (!roomPresence.has(roomCode)) {
    roomPresence.set(roomCode, new Map());
  }
  return roomPresence.get(roomCode);
};

/**
 * Broadcast presence list to all users in a room
 */
const broadcastPresence = (io, roomCode) => {
  const presence = getRoomPresence(roomCode);
  io.to(`room:${roomCode}`).emit('presence-update', {
    users: Array.from(presence.values()).map((u) => ({
      userId: u.userId,
      name: u.name,
      socketId: u.socketId,
    })),
  });
};

/** Identity of the socket's user, as broadcast to other room members. */
const socketIdentity = (socket) => ({
  userId: socket.user._id.toString(),
  name: socket.user.name,
});

/** Debounced snapshot persistence: coalesce rapid edits into a single write. */
const SNAPSHOT_DEBOUNCE_MS = 500;
const snapshotTimers = new Map(); // socketId -> { roomCode, timer, pendingContent, pendingLanguage }

function persistSnapshot(socket, roomCode, content, language) {
  const entry = snapshotTimers.get(socket.id);

  // Reset the timer and remember the latest state.
  if (entry) {
    clearTimeout(entry.timer);
  }

  snapshotTimers.set(socket.id, {
    roomCode,
    pendingContent: content,
    pendingLanguage: language,
    timer: setTimeout(() => {
      flushSnapshot(socket.id);
    }, SNAPSHOT_DEBOUNCE_MS),
  });
}

function flushSnapshot(socketId) {
  const entry = snapshotTimers.get(socketId);
  if (!entry) return;
  snapshotTimers.delete(socketId);

  const { roomCode, pendingContent, pendingLanguage } = entry;
  Room.updateOne(
    { roomCode },
    {
      $set: {
        snapshotCode: pendingContent,
        ...(pendingLanguage ? { language: pendingLanguage } : {}),
      },
    }
  ).catch((err) => logger.error('Failed to persist code snapshot', { message: err.message }));
}

function clearSnapshotTimer(socket) {
  const entry = snapshotTimers.get(socket.id);
  if (entry) {
    clearTimeout(entry.timer);
    snapshotTimers.delete(socket.id);
  }
}

/**
 * Initialize Socket.IO server
 */
const initializeSocket = (io) => {
  logger.info('Initializing Socket.IO server...');

  // Rate-limit raw connections per IP before authentication.
  io.use(enforceConnectionLimit);

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    // Note: prefer handshake.auth.token; query string retained for
    // backward compatibility with existing clients.
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required. Please provide a valid token.'));
    }

    try {
      const user = await authenticateSocket(token);

      if (!user) {
        return next(new Error('Invalid or expired token.'));
      }

      // Attach user to socket
      socket.user = user;
      next();
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError'
      ) {
        return next(new Error('Invalid or expired token.'));
      }

      logger.error('Socket authentication error', { message: error.message });
      return next(new Error('Authentication service error. Please try again.'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.user.name} (${socket.id})`);

    /**
     * Join a room by room code
     * Event: join-room
     * Payload: { roomCode: string }
     */
    socket.on('join-room', async (data, callback) => {
      try {
        const { roomCode } = data;

        if (!roomCode || typeof roomCode !== 'string') {
          return callback?.({ error: 'Room code is required.' });
        }

        const normalizedRoomCode = normalizeRoomCode(roomCode);

        // Find room and verify membership
        const room = await findRoomByCode(normalizedRoomCode);

        if (!room) {
          return callback?.({ error: 'Room not found.' });
        }

        if (!isRoomParticipant(room, socket.user._id)) {
          return callback?.({ error: 'You are not authorized to join this room.' });
        }

        if (socket.currentRoom && socket.currentRoom !== normalizedRoomCode) {
          handleLeaveRoom(io, socket);
        }

        // Join the room channel
        socket.join(`room:${normalizedRoomCode}`);
        socket.currentRoom = normalizedRoomCode;

        // Add to presence
        const presence = getRoomPresence(normalizedRoomCode);
        presence.set(socket.id, { ...socketIdentity(socket), socketId: socket.id });

        // Notify others in room
        socket.to(`room:${normalizedRoomCode}`).emit('user-joined', socketIdentity(socket));

        // Broadcast updated presence
        broadcastPresence(io, normalizedRoomCode);

        // Send current room state to the joining user
        const currentUsers = Array.from(presence.values()).map((u) => ({
          userId: u.userId,
          name: u.name,
          socketId: u.socketId,
        }));

        callback?.({
          success: true,
          room: {
            roomCode: normalizedRoomCode,
            name: room.name,
            language: room.language,
          },
          users: currentUsers,
        });

        logger.info(`User ${socket.user.name} joined room ${normalizedRoomCode}`);
      } catch (error) {
        logger.error('Error joining room', { message: error.message });
        callback?.({ error: 'Failed to join room.' });
      }
    });

    /**
     * Leave current room
     * Event: leave-room
     */
    socket.on('leave-room', () => {
      if (socket.currentRoom) {
        handleLeaveRoom(io, socket);
      }
    });

    /**
     * Code change event - broadcast to other room members
     * Event: code-change
     * Payload: { content: string, language?: string }
     */
    socket.on('code-change', (data, callback) => {
      if (!socket.currentRoom) {
        return callback?.({ error: 'Not in a room.' });
      }

      const { content, language } = data;

      if (content === undefined) {
        return callback?.({ error: 'Content is required.' });
      }

      if (typeof content === 'string' && content.length > MAX_CODE_SIZE) {
        return callback?.({ error: `Code payload exceeds maximum size of ${MAX_CODE_SIZE} bytes.` });
      }

      if (!checkEventRate(socket, 'code-change')) {
        return callback?.({ error: 'Rate limit exceeded. Please slow down.' });
      }

      // Persist snapshot to room document (debounced, non-blocking).
      persistSnapshot(socket, socket.currentRoom, content, language);

      // Broadcast to other users in the room (not sender)
      socket.to(`room:${socket.currentRoom}`).emit('code-change', {
        content,
        language,
        userId: socket.user._id.toString(),
        userName: socket.user.name,
      });

      callback?.({ success: true });
    });

    /**
     * Cursor position update (optional feature)
     * Event: cursor-update
     * Payload: { position: { line: number, column: number }, selection?: object }
     */
    socket.on('cursor-update', (data) => {
      if (!socket.currentRoom) return;

      if (!checkEventRate(socket, 'cursor-update')) return;

      const { position, selection } = data;

      socket.to(`room:${socket.currentRoom}`).emit('cursor-update', {
        userId: socket.user._id.toString(),
        userName: socket.user.name,
        position,
        selection,
      });
    });

    /**
     * Chat message event - persist and broadcast
     * Event: chat-message
     * Payload: { content: string }
     */
    socket.on('chat-message', async (data, callback) => {
      try {
        if (!socket.currentRoom) {
          return callback?.({ error: 'Not in a room.' });
        }

        if (!checkEventRate(socket, 'chat-message')) {
          return callback?.({ error: 'Rate limit exceeded. Please slow down.' });
        }

        const { content } = data;

        if (!content || typeof content !== 'string' || !content.trim()) {
          return callback?.({ error: 'Message content is required.' });
        }

        const trimmedContent = content.trim().substring(0, 1000);

        // Find room to get MongoDB ID
        const room = await findRoomByCode(socket.currentRoom);

        if (!room) {
          return callback?.({ error: 'Room not found.' });
        }

        // Save message to database
        const message = await Message.create({
          room: room._id,
          sender: socket.user._id,
          content: trimmedContent,
        });

        // Populate sender info
        const populatedMessage = await Message.findById(message._id).populate(
          'sender',
          'name email'
        );

        // Broadcast to all users in room (including sender for confirmation).
        // IDs are stringified so the frontend deduplication (appendUniqueMessage)
        // can compare them with strict equality.
        io.to(`room:${socket.currentRoom}`).emit('chat-message', {
          _id: populatedMessage._id.toString(),
          content: populatedMessage.content,
          sender: {
            _id: (populatedMessage.sender?._id || socket.user._id).toString(),
            name: populatedMessage.sender?.name || socket.user.name,
            email: populatedMessage.sender?.email || socket.user.email || '',
          },
          createdAt: populatedMessage.createdAt,
        });

        callback?.({ success: true, message: populatedMessage });

        logger.info(`Message in room ${socket.currentRoom} from ${socket.user.name}`);
      } catch (error) {
        logger.error('Error sending message', { message: error.message });
        callback?.({ error: 'Failed to send message.' });
      }
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.user.name} (${socket.id})`);
      handleLeaveRoom(io, socket);
    });
  });

  logger.info('Socket.IO server initialized successfully');
};

/**
 * Handle leaving a room (on disconnect or explicit leave)
 */
const handleLeaveRoom = (io, socket) => {
  if (!socket.currentRoom) return;

  const roomCode = socket.currentRoom;
  const presence = getRoomPresence(roomCode);

  // Flush any pending snapshot and cancel future debounces.
  flushSnapshot(socket.id);
  clearSnapshotTimer(socket);

  // Remove from presence
  presence.delete(socket.id);

  // Leave the room channel
  socket.leave(`room:${roomCode}`);

  // Notify others
  socket.to(`room:${roomCode}`).emit('user-left', socketIdentity(socket));

  // Broadcast updated presence
  broadcastPresence(io, roomCode);

  // Clean up empty room presence maps
  if (presence.size === 0) {
    roomPresence.delete(roomCode);
  }

  socket.currentRoom = null;

  logger.info(`User ${socket.user.name} left room ${roomCode}`);
};

module.exports = initializeSocket;
