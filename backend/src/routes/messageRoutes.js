const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const messageController = require('../controllers/messageController');

const asyncHandler = require('../utils/asyncHandler');

// All message routes require authentication
router.use(authMiddleware);

/**
 * GET /api/messages/room/:roomCode
 * Get recent messages for a room (last 50)
 */
router.get('/room/:roomCode', asyncHandler(messageController.getRoomMessages));

module.exports = router;
