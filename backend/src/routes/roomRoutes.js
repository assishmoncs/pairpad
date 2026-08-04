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

// All room routes require authentication
router.use(authMiddleware);

// POST /api/rooms - Create new room
router.post('/', createRoom);

// GET /api/rooms - Get all rooms for current user
router.get('/', getUserRooms);

// GET /api/rooms/:identifier - Get room by ID or room code
router.get('/:identifier', getRoom);

// POST /api/rooms/:roomCode/join - Join a room
router.post('/:roomCode/join', joinRoom);

// POST /api/rooms/:roomCode/leave - Leave a room
router.post('/:roomCode/leave', leaveRoom);

// POST /api/rooms/:roomCode/transfer - Transfer ownership (owner only)
router.post('/:roomCode/transfer', transferOwnership);

// DELETE /api/rooms/:roomCode - Delete a room (owner only)
router.delete('/:roomCode', deleteRoom);

module.exports = router;
