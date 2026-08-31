const Message = require('../models/Message');
const logger = require('../utils/logger');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { findRoomByCode, isRoomParticipant } = require('../utils/roomAccess');
const { parseLimit, parseBeforeDate } = require('../utils/pagination');

const getRoomMessages = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { before } = req.query;
    const room = await findRoomByCode(roomCode, { populate: false });

    if (!room) return sendError(res, 404, 'Room not found.');
    if (!isRoomParticipant(room, req.user._id)) {
      return sendError(res, 403, 'You are not authorized to access messages in this room.');
    }

    const beforeDate = parseBeforeDate(before);
    if (before && !beforeDate) return sendError(res, 400, 'Invalid before timestamp.');

    const query = { room: room._id };
    if (beforeDate) query.createdAt = { $lt: beforeDate };

    const limit = parseLimit(req.query.limit);
    const messages = await Message.find(query)
      .select('_id room sender content createdAt updatedAt')
      .populate('sender', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    messages.reverse();

    return sendSuccess(res, 'Messages retrieved successfully.', {
      messages,
      count: messages.length,
      hasMore: messages.length === limit,
      nextBefore: messages.length ? messages[0].createdAt : null,
    });
  } catch (error) {
    logger.error('Get messages error', { message: error.message });
    return sendError(res, 500, 'Failed to retrieve messages. Please try again.');
  }
};

module.exports = { getRoomMessages };
