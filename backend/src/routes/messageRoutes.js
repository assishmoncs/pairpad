const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Room = require('../models/Room');
const authMiddleware = require('../middleware/auth');

// All message routes require authentication
router.use(authMiddleware);

/**
 * GET /api/messages/room/:roomCode
 * Get recent messages for a room (last 50)
 */
router.get('/room/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    
    // Find room and verify membership
    const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
    
    if (!room) {
      return res.status(404).json({
        message: 'Room not found.'
      });
    }
    
    const isMember = room.members.some(
      member => member._id.toString() === req.user._id.toString()
    );
    
    if (!isMember && room.owner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: 'You are not authorized to access messages in this room.'
      });
    }
    
    // Get last 50 messages, sorted by creation date (oldest first for display)
    const messages = await Message.find({ room: room._id })
      .populate('sender', 'name email')
      .sort({ createdAt: 1 })
      .limit(50);
    
    res.json({
      message: 'Messages retrieved successfully.',
      data: {
        messages,
        count: messages.length,
      },
    });
  } catch (error) {
    console.error('Get messages error:', error.message);
    res.status(500).json({
      message: 'Failed to retrieve messages. Please try again.'
    });
  }
});

module.exports = router;
