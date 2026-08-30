const Room = require('../models/Room');
const logger = require('../utils/logger');
const Revision = require('../models/Revision');
const { findRoomByCode, normalizeRoomCode, getRoomRole } = require('../utils/roomAccess');
const { canEdit, getMemberRole } = require('../utils/roomPermissions');
const { createInitialState, deserializeState, serializeState, visibleText, applyReplaceOperation } = require('../services/textCrdt');
const { shouldCreateAutomaticRevision } = require('../services/revisionService');
const { isRedisReady } = require('../services/redisService');
const { getState: getRedisState, setState: setRedisState, applyOperationAtomic, deleteState: deleteRedisState } = require('../services/redisDocumentState');

const MAX_OPERATION_BYTES = 256 * 1024;
const MAX_STATE_BYTES = 4 * 1024 * 1024;
const SAVE_DEBOUNCE_MS = 750;
const OP_WINDOW_MS = 60 * 1000;
const MAX_OPS_PER_WINDOW = 600;

const documents = new Map();
const saveTimers = new Map();
const latestEditors = new Map();

const buildDocument = (state, snapshotCode = '') => ({
  nodes: state ? deserializeState(state) : createInitialState(snapshotCode || ''),
});

const getDocument = async (roomCode) => {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized) return null;
  if (documents.has(normalized)) return documents.get(normalized);

  const room = await findRoomByCode(normalized);
  if (!room) return null;

  const sharedState = await getRedisState(normalized);
  const document = buildDocument(sharedState || room.crdtState, room.snapshotCode);
  documents.set(normalized, document);

  if (isRedisReady() && !sharedState) {
    const serialized = serializeState(document.nodes);
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_STATE_BYTES) await setRedisState(normalized, serialized);
  }
  return document;
};

const replaceDocumentState = (roomCode, content) => {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized || typeof content !== 'string') return null;
  const nodes = createInitialState(content);
  const serialized = serializeState(nodes);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) return null;
  documents.set(normalized, { nodes });
  const timer = saveTimers.get(normalized);
  if (timer) clearTimeout(timer);
  saveTimers.delete(normalized);
  latestEditors.delete(normalized);
  if (isRedisReady()) setRedisState(normalized, serialized).catch((error) => logger.error('Failed to publish restored CRDT state', { roomCode: normalized, message: error.message }));
  return serialized;
};

const persistRoom = async (roomCode, authorId) => {
  const document = documents.get(roomCode);
  if (!document) return;
  const serialized = serializeState(document.nodes);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) {
    logger.error('CRDT state exceeded maximum persistence size', { roomCode });
    return;
  }

  const content = visibleText(document.nodes);
  if (isRedisReady()) await setRedisState(roomCode, serialized);
  await Room.updateOne({ roomCode }, { $set: { crdtState: serialized, snapshotCode: content } });

  if (authorId && shouldCreateAutomaticRevision(roomCode)) {
    const room = await findRoomByCode(roomCode);
    if (room && content.length <= 524288) {
      await Revision.create({
        room: room._id,
        author: authorId,
        content,
        language: room.language,
        message: 'Automatic checkpoint',
        source: 'automatic',
      });
    }
  }
};

const schedulePersist = (roomCode, authorId) => {
  const timer = saveTimers.get(roomCode);
  if (timer) clearTimeout(timer);
  latestEditors.set(roomCode, authorId);
  saveTimers.set(roomCode, setTimeout(async () => {
    saveTimers.delete(roomCode);
    try {
      await persistRoom(roomCode, latestEditors.get(roomCode));
    } catch (error) {
      logger.error('Failed to persist CRDT state', { roomCode, message: error.message });
    }
  }, SAVE_DEBOUNCE_MS));
};

const getAuthorizedRoom = async (socket, requireEdit = false) => {
  if (!socket.currentRoom || !socket.user?._id) return null;
  const room = await findRoomByCode(socket.currentRoom);
  if (!room) return null;
  if (!room.members.some((member) => member.toString() === socket.user._id.toString()) && room.owner.toString() !== socket.user._id.toString()) return null;
  if (requireEdit && !canEdit(getMemberRole(room, socket.user._id))) return null;
  return room;
};

const withinOperationRate = (socket) => {
  const now = Date.now();
  const attempts = (socket._crdtOps || []).filter((timestamp) => timestamp >= now - OP_WINDOW_MS);
  if (attempts.length >= MAX_OPS_PER_WINDOW) return false;
  attempts.push(now);
  socket._crdtOps = attempts;
  return true;
};

const initializeCrdtSocket = (io) => {
  io.on('connection', (socket) => {
    socket.on('crdt-sync-request', async (_data, callback) => {
      try {
        const room = await getAuthorizedRoom(socket, false);
        if (!room) return callback?.({ error: 'Room membership required.' });
        const document = await getDocument(socket.currentRoom);
        if (!document) return callback?.({ error: 'Room not found.' });
        const state = isRedisReady() ? (await getRedisState(socket.currentRoom)) || serializeState(document.nodes) : serializeState(document.nodes);
        if (Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) return callback?.({ error: 'Collaborative document is too large to synchronize.' });
        const role = getRoomRole(room, socket.user._id);
        socket.emit('crdt-sync', { state, version: 1, role });
        callback?.({ success: true, role });
      } catch (error) {
        logger.error('CRDT sync request failed', { message: error.message });
        callback?.({ error: 'Failed to synchronize collaborative document.' });
      }
    });

    socket.on('crdt-operation', async (operation, callback) => {
      try {
        const room = await getAuthorizedRoom(socket, true);
        if (!room) return callback?.({ error: 'Editor permission required.' });
        if (!withinOperationRate(socket)) return callback?.({ error: 'CRDT operation rate limit exceeded.' });
        if (!operation || operation.type !== 'replace') return callback?.({ error: 'Unsupported CRDT operation.' });
        if (Buffer.byteLength(JSON.stringify(operation), 'utf8') > MAX_OPERATION_BYTES) return callback?.({ error: 'CRDT operation is too large.' });

        if (isRedisReady()) {
          const atomic = await applyOperationAtomic(socket.currentRoom, operation);
          if (atomic) {
            documents.set(socket.currentRoom, buildDocument(atomic.state));
            schedulePersist(socket.currentRoom, socket.user._id);
            socket.to(`room:${socket.currentRoom}`).emit('crdt-operation', operation);
            return callback?.({ success: true, changed: atomic.changed, textLength: atomic.text.length });
          }
        }

        const document = await getDocument(socket.currentRoom);
        if (!document) return callback?.({ error: 'Room not found.' });
        const changed = applyReplaceOperation(document.nodes, operation);
        if (changed) {
          schedulePersist(socket.currentRoom, socket.user._id);
          socket.to(`room:${socket.currentRoom}`).emit('crdt-operation', operation);
        }
        callback?.({ success: true, changed, textLength: visibleText(document.nodes).length });
      } catch (error) {
        logger.error('CRDT operation failed', { message: error.message });
        callback?.({ error: 'Failed to apply collaborative edit.' });
      }
    });

    socket.on('disconnect', () => {
      if (socket.currentRoom) latestEditors.delete(socket.currentRoom);
    });
  });
};

module.exports = { initializeCrdtSocket, replaceDocumentState };
