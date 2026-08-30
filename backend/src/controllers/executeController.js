// Execute code controller — Judge0 API, auth + editor membership required

const judge0Service = require('../services/judge0Service');
const logger = require('../utils/logger');
const { validateSourceCode } = require('../utils/validation');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { canEdit } = require('../utils/roomPermissions');
const {
  findRoomByCode,
  normalizeRoomCode,
  getRoomRole,
} = require('../utils/roomAccess');

const executeCode = async (req, res) => {
  try {
    const { source_code, language, stdin, roomCode } = req.body;
    if (!source_code || typeof source_code !== 'string') return sendError(res, 400, 'Source code is required and must be a string.');

    const sourceCodeCheck = validateSourceCode(source_code);
    if (!sourceCodeCheck.valid) return sendError(res, 400, sourceCodeCheck.error);
    if (!language || typeof language !== 'string') return sendError(res, 400, 'Language is required.');
    if (!roomCode || typeof roomCode !== 'string') return sendError(res, 400, 'roomCode is required to execute code in a room context.');

    const supportedLanguages = Object.keys(judge0Service.LANGUAGE_MAP);
    if (!supportedLanguages.includes(language.toLowerCase())) {
      return sendError(res, 400, `Unsupported language. Supported: ${supportedLanguages.join(', ')}`);
    }
    if (stdin !== undefined && typeof stdin !== 'string') return sendError(res, 400, 'Stdin must be a string.');
    if (stdin !== undefined && stdin.length > 10000) return sendError(res, 400, 'Stdin must not exceed 10000 characters.');

    const normalizedCode = normalizeRoomCode(roomCode);
    const room = await findRoomByCode(normalizedCode);
    if (!room) return sendError(res, 404, 'Room not found.');

    const role = getRoomRole(room, req.user._id);
    if (!canEdit(role)) return sendError(res, 403, 'Editor permission is required to execute code in this room.');

    const result = await judge0Service.submitCode(source_code, language, stdin || '');
    const io = req.io || req.app.get('io');
    io?.to(`room:${normalizedCode}`).emit('code-execution-result', {
      result,
      executedBy: req.user._id,
      executedByName: req.user.name,
      language,
      timestamp: new Date().toISOString(),
    });
    sendSuccess(res, 'Code executed successfully.', { result });
  } catch (error) {
    logger.error('Error executing code', { message: error.message });
    if (error.message.includes('API key')) return sendError(res, 503, 'Code execution service not configured. Please contact the administrator.');
    if (error.message.includes('Rate limit')) return sendError(res, 429, 'Rate limit exceeded. Please try again in a few moments.');
    if (error.message.includes('timed out')) return sendError(res, 408, 'Code execution timed out. The code may be taking too long to run.');
    if (error.message.includes('Unsupported language')) return sendError(res, 400, error.message);
    sendError(res, 500, 'Failed to execute code. Please try again.');
  }
};

module.exports = { executeCode };
