// Express routes for code execution
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { executeCode } = require('../controllers/executeController');

const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/execute
 * Execute code using Judge0 API
 * Body: { source_code, language, stdin?, roomCode? }
 * Requires authentication
 */
router.post(
  '/',
  authMiddleware,
  asyncHandler(async (req, res, next) => {
    // Attach io to req so controller can broadcast to rooms
    req.io = req.app.get('io');
    await executeCode(req, res, next);
  })
);

module.exports = router;
