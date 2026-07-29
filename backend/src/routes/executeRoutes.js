// Express routes for code execution
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { executeCode } = require('../controllers/executeController');

/**
 * POST /api/execute
 * Execute code using Judge0 API
 * Body: { source_code, language, stdin?, roomCode? }
 * Requires authentication
 */
router.post('/', authMiddleware, async (req, res) => {
  // Attach io to req so controller can broadcast to rooms
  req.io = req.app.get('io');
  await executeCode(req, res);
});

module.exports = router;
