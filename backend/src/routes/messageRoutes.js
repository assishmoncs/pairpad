const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { findRoomByCode, isRoomParticipant } = require('../utils/roomAccess');

// All message routes require authentication
router.use(authMiddleware);

/**
 * GET /api/messages/room/:roomCode
 * Get recent messages for a room (last 50)
 */
router.get('/room/:roomCode', async (req, res) => {
  try {
    // Find room and verify membership
    const room = await findRoomByCode(req.params.roomCode);

    if (!room) {
      return sendError(res, 404, 'Room not found.');
    }

    if (!isRoomParticipant(room, req.user._id)) {
      return sendError(res, 403, 'You are not authorized to access messages in this room.');
    }

    // Get last 50 messages, sorted by creation date (oldest first for display)
    const messages = await Message.find({ room: room._id })
      .populate('sender', 'name email')
      .sort({ createdAt: 1 })
      .limit(50);

    sendSuccess(res, 'Messages retrieved successfully.', {
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error('Get messages error:', error.message);
    sendError(res, 500, 'Failed to retrieve messages. Please try again.');
  }
});

module.exports = router;
