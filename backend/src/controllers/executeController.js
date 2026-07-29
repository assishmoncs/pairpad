// Execute code controller — Judge0 API, auth + room membership required

const judge0Service = require('../services/judge0Service');
const Room = require('../models/Room');

/**
 * POST /api/execute
 * Body: { source_code, language, stdin?, roomCode }
 */
const executeCode = async (req, res) => {
  try {
    const { source_code, language, stdin, roomCode } = req.body;

    if (!source_code || typeof source_code !== 'string') {
      return res.status(400).json({
        message: 'Source code is required and must be a string.',
      });
    }

    if (!language || typeof language !== 'string') {
      return res.status(400).json({
        message: 'Language is required.',
      });
    }

    if (!roomCode || typeof roomCode !== 'string') {
      return res.status(400).json({
        message: 'roomCode is required to execute code in a room context.',
      });
    }

    const supportedLanguages = Object.keys(judge0Service.LANGUAGE_MAP);
    if (!supportedLanguages.includes(language.toLowerCase())) {
      return res.status(400).json({
        message: `Unsupported language. Supported: ${supportedLanguages.join(', ')}`,
      });
    }

    if (stdin !== undefined && typeof stdin !== 'string') {
      return res.status(400).json({
        message: 'Stdin must be a string.',
      });
    }

    const normalizedCode = roomCode.toUpperCase().trim();
    const room = await Room.findOne({ roomCode: normalizedCode });

    if (!room) {
      return res.status(404).json({
        message: 'Room not found.',
      });
    }

    const userId = req.user._id.toString();
    const isMember = room.members.some((m) => m.toString() === userId);
    const isOwner = room.owner.toString() === userId;

    if (!isMember && !isOwner) {
      return res.status(403).json({
        message: 'You must be a member of the room to execute code.',
      });
    }

    const result = await judge0Service.submitCode(
      source_code,
      language,
      stdin || ''
    );

    const io = req.io || req.app.get('io');
    if (io) {
      io.to(`room:${normalizedCode}`).emit('code-execution-result', {
        result,
        executedBy: req.user._id,
        executedByName: req.user.name,
        language,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      message: 'Code executed successfully.',
      data: { result },
    });
  } catch (error) {
    console.error('[ExecuteController] Error executing code:', error.message);

    if (error.message.includes('API key')) {
      return res.status(503).json({
        message:
          'Code execution service not configured. Please contact the administrator.',
      });
    }

    if (error.message.includes('Rate limit')) {
      return res.status(429).json({
        message: 'Rate limit exceeded. Please try again in a few moments.',
      });
    }

    if (error.message.includes('timed out')) {
      return res.status(408).json({
        message:
          'Code execution timed out. The code may be taking too long to run.',
      });
    }

    res.status(500).json({
      message: 'Failed to execute code.',
      error: error.message,
    });
  }
};

module.exports = {
  executeCode,
};
