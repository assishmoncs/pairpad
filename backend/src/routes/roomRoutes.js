const express = require('express');
const router = express.Router();
const {
  createRoom,
  getUserRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  transferOwnership,
  updateMemberRole,
  deleteRoom,
} = require('../controllers/roomController');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.use(authMiddleware);
router.post('/', asyncHandler(createRoom));
router.get('/', asyncHandler(getUserRooms));
router.get('/:identifier', asyncHandler(getRoom));
router.post('/:roomCode/join', asyncHandler(joinRoom));
router.post('/:roomCode/leave', asyncHandler(leaveRoom));
router.post('/:roomCode/transfer', asyncHandler(transferOwnership));
router.patch('/:roomCode/members/:userId/role', asyncHandler(updateMemberRole));
router.delete('/:roomCode', asyncHandler(deleteRoom));

module.exports = router;
