const Revision = require('../models/Revision');
const { parseBeforeDate, parseLimit } = require('../utils/pagination');

const MIN_AUTOMATIC_INTERVAL_MS = 10 * 1000;
const lastAutomaticCheckpoint = new Map();

const createRevision = async ({ room, author, content, language, message, source = 'automatic', restoredFrom = null }) =>
  Revision.create({ room, author, content, language, message, source, restoredFrom });

const shouldCreateAutomaticRevision = (roomId) => {
  const last = lastAutomaticCheckpoint.get(roomId);
  const now = Date.now();
  if (last && now - last < MIN_AUTOMATIC_INTERVAL_MS) return false;
  lastAutomaticCheckpoint.set(roomId, now);
  return true;
};

const listRevisions = async (roomId, limit = 50, before) => {
  const safeLimit = parseLimit(limit);
  const beforeDate = parseBeforeDate(before);
  if (before && !beforeDate) {
    const error = new Error('Invalid revision cursor.');
    error.code = 'INVALID_CURSOR';
    throw error;
  }

  const query = { room: roomId };
  if (beforeDate) query.createdAt = { $lt: beforeDate };

  return Revision.find(query)
    .select('_id room author content language message source restoredFrom createdAt updatedAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit)
    .populate('author', 'name email')
    .lean();
};

const findRevision = async (revisionId, roomId) =>
  Revision.findOne({ _id: revisionId, room: roomId })
    .select('_id room author content language message source restoredFrom createdAt updatedAt')
    .populate('author', 'name email')
    .lean();

const clearAutomaticCheckpoint = (roomId) => {
  lastAutomaticCheckpoint.delete(roomId);
};

module.exports = {
  MIN_AUTOMATIC_INTERVAL_MS,
  createRevision,
  shouldCreateAutomaticRevision,
  listRevisions,
  findRevision,
  clearAutomaticCheckpoint,
};
