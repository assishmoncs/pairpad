const express = require('express');
const router = express.Router();
const { register, login, getMe, refreshAccessToken } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const asyncHandler = require('../utils/asyncHandler');

// POST /api/auth/register - Register new user
router.post('/register', asyncHandler(register));

// POST /api/auth/login - Login user
router.post('/login', asyncHandler(login));

// GET /api/auth/me - Get current user (protected)
router.get('/me', authMiddleware, asyncHandler(getMe));

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', asyncHandler(refreshAccessToken));

module.exports = router;
