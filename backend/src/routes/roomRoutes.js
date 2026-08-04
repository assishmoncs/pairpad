const express = require('express');
const router = express.Router();
const {
  createRoom,
  getUserRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  transferOwnership,
  deleteRoom,
} = require('../controllers/roomController');
const authMiddleware = require('../middleware/auth');

const asyncHandler = require('../utils/asyncHandler');

// All room routes require authentication
router.use(authMiddleware);

// POST /api/rooms - Create new room
router.post('/', asyncHandler(createRoom));

// GET /api/rooms - Get all rooms for current user
router.get('/', asyncHandler(getUserRooms));

// GET /api/rooms/:identifier - Get room by ID or room code
router.get('/:identifier', asyncHandler(getRoom));

// POST /api/rooms/:roomCode/join - Join a room
router.post('/:roomCode/join', asyncHandler(joinRoom));

// POST /api/rooms/:roomCode/leave - Leave a room
router.post('/:roomCode/leave', asyncHandler(leaveRoom));

// POST /api/rooms/:roomCode/transfer - Transfer ownership (owner only)
router.post('/:roomCode/transfer', asyncHandler(transferOwnership));

// DELETE /api/rooms/:roomCode - Delete a room (owner only)
router.delete('/:roomCode', asyncHandler(deleteRoom));

module.exports = router;
