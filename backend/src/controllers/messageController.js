const Message = require('../models/Message');
const logger = require('../utils/logger');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { findRoomByCode, isRoomParticipant } = require('../utils/roomAccess');

const getRoomMessages = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { before } = req.query;

    // Find room and verify membership
    const room = await findRoomByCode(roomCode);

    if (!room) {
      return sendError(res, 404, 'Room not found.');
    }

    if (!isRoomParticipant(room, req.user._id)) {
      return sendError(res, 403, 'You are not authorized to access messages in this room.');
    }

    // Build query
    const query = { room: room._id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    // Get last 50 messages, sorted by creation date (oldest first for display)
    const messagesRaw = await Message.find(query)
      .populate('sender', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);

    const messages = messagesRaw.reverse();

    sendSuccess(res, 'Messages retrieved successfully.', {
      messages,
      count: messages.length,
    });
  } catch (error) {
    logger.error('Get messages error', { message: error.message });
    sendError(res, 500, 'Failed to retrieve messages. Please try again.');
  }
};

module.exports = {
  getRoomMessages,
};
