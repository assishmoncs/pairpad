/**
 * Socket.IO handler for real-time collaboration in PairPad.
 * 
 * Features:
 * - JWT authentication for socket connections
 * - Room-based channels for collaboration
 * - Code synchronization (full document sync for MVP)
 * - User presence tracking
 * - Chat message broadcasting and persistence
 * 
 * Limitations (MVP):
 * - Uses full document sync instead of CRDT/OT
 * - Last-write-wins conflict resolution
 * - Not production multi-instance ready
 */

const Message = require('../models/Message');
const { getUserFromToken } = require('../utils/tokenAuth');
const {
  findRoomByCode,
  isRoomParticipant,
  normalizeRoomCode,
} = require('../utils/roomAccess');

// Store online users per room: { [roomCode]: Map<socketId, { userId, name, socketId }> }
const roomPresence = new Map();

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

/**
 * Initialize Socket.IO server
 */
const initializeSocket = (io) => {
  console.log('[Socket] Initializing Socket.IO server...');

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
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

      console.error('[Socket] Authentication error:', error.message);
      return next(new Error('Authentication service error. Please try again.'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.user.name} (${socket.id})`);

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
        const currentUsers = Array.from(presence.values()).map(u => ({
          userId: u.userId,
          name: u.name,
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
        
        console.log(`[Socket] User ${socket.user.name} joined room ${normalizedRoomCode}`);
      } catch (error) {
        console.error('[Socket] Error joining room:', error.message);
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
     * 
     * Note: MVP uses full document sync. Future: implement operational transforms or CRDT.
     */
    socket.on('code-change', (data, callback) => {
      if (!socket.currentRoom) {
        return callback?.({ error: 'Not in a room.' });
      }
      
      const { content, language } = data;
      
      if (content === undefined) {
        return callback?.({ error: 'Content is required.' });
      }
      
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
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'name email');
        
        // Broadcast to all users in room (including sender for confirmation)
        io.to(`room:${socket.currentRoom}`).emit('chat-message', {
          _id: populatedMessage._id,
          content: populatedMessage.content,
          sender: {
            _id: populatedMessage.sender._id,
            name: populatedMessage.sender.name,
            email: populatedMessage.sender.email,
          },
          createdAt: populatedMessage.createdAt,
        });
        
        callback?.({ success: true, message: populatedMessage });
        
        console.log(`[Socket] Message in room ${socket.currentRoom} from ${socket.user.name}`);
      } catch (error) {
        console.error('[Socket] Error sending message:', error.message);
        callback?.({ error: 'Failed to send message.' });
      }
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${socket.user.name} (${socket.id})`);
      handleLeaveRoom(io, socket);
    });
  });

  console.log('[Socket] Socket.IO server initialized successfully');
};

/**
 * Handle leaving a room (on disconnect or explicit leave)
 */
const handleLeaveRoom = (io, socket) => {
  if (!socket.currentRoom) return;
  
  const roomCode = socket.currentRoom;
  const presence = getRoomPresence(roomCode);
  
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
  
  console.log(`[Socket] User ${socket.user.name} left room ${roomCode}`);
};

module.exports = initializeSocket;
