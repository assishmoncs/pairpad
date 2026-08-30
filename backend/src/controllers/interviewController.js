const Room = require('../models/Room');
const logger = require('../utils/logger');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { findRoomByCode, isRoomParticipant, normalizeRoomCode, getRoomRole } = require('../utils/roomAccess');
const { ROLES } = require('../utils/roomPermissions');
const {
  createOrUpdateInterview,
  startInterview,
  pauseInterview,
  resumeInterview,
  endInterview,
  submitCandidate,
  sanitizePublicInterview,
  sanitizeHostInterview,
} = require('../services/interviewService');

const loadRoom = async (roomCode) => findRoomByCode(normalizeRoomCode(roomCode));
const requireParticipant = async (roomCode, userId) => {
  const room = await loadRoom(roomCode);
  if (!room || !isRoomParticipant(room, userId)) return null;
  return room;
};

const getInterview = async (req, res) => {
  try {
    const room = await requireParticipant(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    const role = getRoomRole(room, req.user._id);
    return sendSuccess(res, 'Interview retrieved successfully.', {
      interview: role === ROLES.OWNER ? sanitizeHostInterview(room.interview) : sanitizePublicInterview(room.interview),
    });
  } catch (error) {
    logger.error('Get interview error', { message: error.message });
    return sendError(res, 500, 'Failed to retrieve interview.');
  }
};

const configureInterview = async (req, res) => {
  try {
    const room = await loadRoom(req.params.roomCode);
    if (!room) return sendError(res, 404, 'Room not found.');
    const interview = await createOrUpdateInterview(room, req.user._id, req.body || {});
    req.app.get('io')?.to(`room:${room.roomCode}`).emit('interview-updated', sanitizePublicInterview(interview));
    return sendSuccess(res, 'Interview configured successfully.', { interview: sanitizeHostInterview(interview) });
  } catch (error) {
    logger.error('Configure interview error', { message: error.message });
    const status = ['FORBIDDEN', 'INTERVIEW_ACTIVE', 'INVALID_INTERVIEW'].includes(error.code) ? (error.code === 'FORBIDDEN' ? 403 : 400) : 500;
    return sendError(res, status, error.message || 'Failed to configure interview.');
  }
};

const transition = (method) => async (req, res) => {
  try {
    const room = await loadRoom(req.params.roomCode);
    if (!room) return sendError(res, 404, 'Room not found.');
    const interview = await method(room, req.user._id);
    const io = req.app.get('io');
    io?.to(`room:${room.roomCode}`).emit('interview-state-changed', sanitizePublicInterview(interview));
    return sendSuccess(res, 'Interview state updated.', { interview: getRoomRole(room, req.user._id) === ROLES.OWNER ? sanitizeHostInterview(interview) : sanitizePublicInterview(interview) });
  } catch (error) {
    logger.error('Interview transition error', { message: error.message });
    const status = ['FORBIDDEN', 'INVALID_STATE'].includes(error.code) ? (error.code === 'FORBIDDEN' ? 403 : 400) : 500;
    return sendError(res, status, error.message || 'Failed to update interview state.');
  }
};

const submit = async (req, res) => {
  try {
    const room = await requireParticipant(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    if (typeof req.body?.sourceCode !== 'string' || req.body.sourceCode.length > 51200) return sendError(res, 400, 'Source code is required and must not exceed 50KB.');
    if (typeof req.body?.language !== 'string') return sendError(res, 400, 'Language is required.');
    const result = await submitCandidate(room, req.user._id, req.body.sourceCode, req.body.language);
    return sendSuccess(res, 'Interview submission evaluated.', {
      publicResults: result.publicResults,
      hiddenResults: result.hiddenResults.map(({ id, name, passed, actualOutput, status, time, memory }) => ({ id, name, passed, actualOutput, status, time, memory })),
      hiddenPassed: result.hiddenPassed,
      score: result.score,
      total: result.total,
    });
  } catch (error) {
    logger.error('Interview submission error', { message: error.message });
    const status = ['FORBIDDEN', 'INVALID_STATE', 'INVALID_INTERVIEW'].includes(error.code) ? (error.code === 'FORBIDDEN' ? 403 : 400) : 500;
    return sendError(res, status, error.message || 'Failed to evaluate interview submission.');
  }
};

module.exports = { getInterview, configureInterview, startInterview: transition(startInterview), pauseInterview: transition(pauseInterview), resumeInterview: transition(resumeInterview), endInterview: transition(endInterview), submit };
