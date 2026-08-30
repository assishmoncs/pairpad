const Revision = require('../models/Revision');

const MIN_AUTOMATIC_INTERVAL_MS = 10 * 1000;
const lastAutomaticCheckpoint = new Map();

const createRevision = async ({ room, author, content, language, message, source = 'automatic', restoredFrom = null }) => {
  return Revision.create({ room, author, content, language, message, source, restoredFrom });
};

const shouldCreateAutomaticRevision = (roomId) => {
  const last = lastAutomaticCheckpoint.get(roomId);
  const now = Date.now();
  if (last && now - last < MIN_AUTOMATIC_INTERVAL_MS) return false;
  lastAutomaticCheckpoint.set(roomId, now);
  return true;
};

const listRevisions = async (roomId, limit = 50, before) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const query = { room: roomId };
  if (before) query.createdAt = { $lt: new Date(before) };

  return Revision.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate('author', 'name email')
    .lean();
};

const findRevision = async (revisionId, roomId) =>
  Revision.findOne({ _id: revisionId, room: roomId }).populate('author', 'name email').lean();

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
