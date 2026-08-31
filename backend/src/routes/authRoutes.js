const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  refreshAccessToken,
  logout,
  logoutAll,
} = require('../controllers/authSessionController');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/refresh', asyncHandler(refreshAccessToken));
router.post('/logout', asyncHandler(logout));
router.get('/me', authMiddleware, asyncHandler(getMe));
router.post('/logout-all', authMiddleware, asyncHandler(logoutAll));

module.exports = router;
