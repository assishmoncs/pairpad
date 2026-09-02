const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authMiddleware = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  register,
  login,
  refreshAccessToken,
  logout,
  logoutAll,
  getMe,
} = require('../controllers/authSessionController');

const router = express.Router();

router.post('/register', authLimiter, asyncHandler(register));
router.post('/login', authLimiter, asyncHandler(login));
router.post('/refresh', authLimiter, asyncHandler(refreshAccessToken));
router.post('/logout', asyncHandler(logout));
router.get('/me', authMiddleware, asyncHandler(getMe));
router.post('/logout-all', authMiddleware, asyncHandler(logoutAll));

module.exports = router;
