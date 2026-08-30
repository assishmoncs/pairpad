const mongoose = require('mongoose');
const Room = require('../models/Room');
const Revision = require('../models/Revision');
const logger = require('../utils/logger');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { ROLES, getMemberRole } = require('../utils/roomPermissions');
const { findRoomByCode, isRoomParticipant, normalizeRoomCode } = require('../utils/roomAccess');
const { listRevisions, findRevision, createRevision, clearAutomaticCheckpoint } = require('../services/revisionService');
const { createInitialState, serializeState, visibleText } = require('../services/textCrdt');

const requireMember = async (roomCode, userId) => {
  const room = await findRoomByCode(roomCode);
  if (!room || !isRoomParticipant(room, userId)) return null;
  return room;
};

const getRevisions = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');

    const revisions = await listRevisions(room._id, req.query.limit, req.query.before);
    sendSuccess(res, 'Revision history retrieved successfully.', { revisions });
  } catch (error) {
    logger.error('Get revisions error', { message: error.message });
    sendError(res, 500, 'Failed to retrieve revision history.');
  }
};

const getRevisionDiff = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');

    const { from, to } = req.query;
    if (!from || !mongoose.isValidObjectId(from)) return sendError(res, 400, 'A valid from revision id is required.');
    if (!to || !mongoose.isValidObjectId(to)) return sendError(res, 400, 'A valid to revision id is required.');

    const [fromRevision, toRevision] = await Promise.all([
      Revision.findOne({ _id: from, room: room._id }).lean(),
      Revision.findOne({ _id: to, room: room._id }).lean(),
    ]);

    if (!fromRevision || !toRevision) return sendError(res, 404, 'One or both revisions were not found.');

    sendSuccess(res, 'Revision comparison retrieved successfully.', {
      from: { id: fromRevision._id, content: fromRevision.content, language: fromRevision.language, createdAt: fromRevision.createdAt },
      to: { id: toRevision._id, content: toRevision.content, language: toRevision.language, createdAt: toRevision.createdAt },
    });
  } catch (error) {
    logger.error('Get revision diff error', { message: error.message });
    sendError(res, 500, 'Failed to compare revisions.');
  }
};

const createManualRevision = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    const role = getMemberRole(room, req.user._id);
    if (![ROLES.OWNER, ROLES.EDITOR].includes(role)) return sendError(res, 403, 'Editor permission required.');

    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 120) : 'Manual checkpoint';
    const revision = await createRevision({
      room: room._id,
      author: req.user._id,
      content: room.snapshotCode || '',
      language: room.language,
      message: message || 'Manual checkpoint',
      source: 'manual',
    });

    clearAutomaticCheckpoint(room._id.toString());
    const populated = await Revision.findById(revision._id).populate('author', 'name email').lean();
    sendSuccess(res, 'Revision checkpoint created.', { revision: populated }, { status: 201 });
  } catch (error) {
    logger.error('Create manual revision error', { message: error.message });
    sendError(res, 500, 'Failed to create revision checkpoint.');
  }
};

const restoreRevision = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    if (getMemberRole(room, req.user._id) !== ROLES.OWNER) return sendError(res, 403, 'Only the room owner can restore revisions.');

    if (!mongoose.isValidObjectId(req.params.revisionId)) return sendError(res, 400, 'Invalid revision id.');
    const revision = await findRevision(req.params.revisionId, room._id);
    if (!revision) return sendError(res, 404, 'Revision not found.');

    const nextState = serializeState(createInitialState(revision.content));
    if (Buffer.byteLength(nextState, 'utf8') > 4 * 1024 * 1024) return sendError(res, 400, 'Revision is too large to restore.');

    await Room.updateOne(
      { _id: room._id },
      { $set: { snapshotCode: revision.content, language: revision.language, crdtState: nextState } }
    );

    const restoreRevisionRecord = await createRevision({
      room: room._id,
      author: req.user._id,
      content: revision.content,
      language: revision.language,
      message: `Restored revision ${revision._id}`,
      source: 'restore',
      restoredFrom: revision._id,
    });

    const io = req.app.get('io');
    io?.to(`room:${room.roomCode}`).emit('document-restored', {
      roomCode: room.roomCode,
      content: revision.content,
      language: revision.language,
      restoredFrom: revision._id.toString(),
      restoredBy: req.user._id.toString(),
      revisionId: restoreRevisionRecord._id.toString(),
    });

    const populatedRestore = await Revision.findById(restoreRevisionRecord._id).populate('author', 'name email').lean();
    sendSuccess(res, 'Revision restored successfully.', { revision: populatedRestore });
  } catch (error) {
    logger.error('Restore revision error', { message: error.message });
    sendError(res, 500, 'Failed to restore revision.');
  }
};

module.exports = {
  getRevisions,
  getRevisionDiff,
  createManualRevision,
  restoreRevision,
};
