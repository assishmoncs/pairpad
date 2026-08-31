const Room = require('../models/Room');
const logger = require('../utils/logger');
const Revision = require('../models/Revision');
const WorkspaceFile = require('../models/WorkspaceFile');
const { findRoomByCode, normalizeRoomCode, getRoomRole } = require('../utils/roomAccess');
const { canEdit, getMemberRole } = require('../utils/roomPermissions');
const { createInitialState, deserializeState, serializeState, visibleText, applyReplaceOperation } = require('../services/textCrdt');
const { shouldCreateAutomaticRevision } = require('../services/revisionService');
const { isRedisReady } = require('../services/redisService');
const { getState: getRedisState, setState: setRedisState, applyOperationAtomic } = require('../services/redisDocumentState');
const { fileKey } = require('../services/workspaceFileService');

const MAX_OPERATION_BYTES = 256 * 1024;
const MAX_STATE_BYTES = 4 * 1024 * 1024;
const SAVE_DEBOUNCE_MS = 750;
const OP_WINDOW_MS = 60 * 1000;
const MAX_OPS_PER_WINDOW = 600;
const documents = new Map();
const saveTimers = new Map();
const latestEditors = new Map();
const operationQueues = new Map();
const keyFor = (roomCode, fileId) => fileId ? fileKey(roomCode, fileId) : `room:${roomCode}`;
const buildDocument = (state, snapshotCode = '') => ({ nodes: state ? deserializeState(state) : createInitialState(snapshotCode || '') });

const enqueueDocumentOperation = (key, operation) => {
  const previous = operationQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  operationQueues.set(key, next);
  return next.finally(() => {
    if (operationQueues.get(key) === next) operationQueues.delete(key);
  });
};

const resolveFile = async (room, fileId) => {
  if (!fileId) return null;
  return WorkspaceFile.findOne({ _id: fileId, room: room._id });
};

const getDocument = async (roomCode, fileId) => {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized) return null;
  const key = keyFor(normalized, fileId);
  if (documents.has(key)) return documents.get(key);
  const room = await findRoomByCode(normalized);
  if (!room) return null;
  const file = await resolveFile(room, fileId);
  const persistedState = file ? file.crdtState : room.crdtState;
  const snapshot = file ? file.snapshotCode : room.snapshotCode;
  const sharedState = await getRedisState(key);
  const document = buildDocument(sharedState || persistedState, snapshot);
  documents.set(key, document);
  if (isRedisReady() && !sharedState) {
    const serialized = serializeState(document.nodes);
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_STATE_BYTES) await setRedisState(key, serialized);
  }
  return document;
};

const replaceDocumentState = (roomCode, content, fileId) => {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized || typeof content !== 'string') return null;
  const nodes = createInitialState(content);
  const serialized = serializeState(nodes);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) return null;
  const key = keyFor(normalized, fileId);
  documents.set(key, { nodes });
  const timer = saveTimers.get(key);
  if (timer) clearTimeout(timer);
  saveTimers.delete(key);
  latestEditors.delete(key);
  if (isRedisReady()) setRedisState(key, serialized).catch((error) => logger.error('Failed to publish restored CRDT state', { roomCode: normalized, fileId, message: error.message }));
  return serialized;
};

const persistDocument = async (roomCode, fileId, authorId) => {
  const key = keyFor(roomCode, fileId);
  const document = documents.get(key);
  if (!document) return;
  const serialized = serializeState(document.nodes);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) return logger.error('CRDT state exceeded maximum persistence size', { roomCode, fileId });
  const content = visibleText(document.nodes);
  if (isRedisReady()) await setRedisState(key, serialized);
  if (fileId) {
    const room = await findRoomByCode(roomCode);
    if (room) await WorkspaceFile.updateOne({ _id: fileId, room: room._id }, { $set: { crdtState: serialized, snapshotCode: content } });
  } else {
    await Room.updateOne({ roomCode }, { $set: { crdtState: serialized, snapshotCode: content } });
  }
  if (authorId && shouldCreateAutomaticRevision(`${roomCode}:${fileId || 'legacy'}`) && content.length <= 524288) {
    const room = await findRoomByCode(roomCode);
    const file = fileId ? await resolveFile(room, fileId) : null;
    if (room) await Revision.create({ room: room._id, author: authorId, content, language: file?.language || room.language, message: file ? `Automatic checkpoint · ${file.path}` : 'Automatic checkpoint', source: 'automatic' });
  }
};

const schedulePersist = (roomCode, fileId, authorId) => {
  const key = keyFor(roomCode, fileId);
  const timer = saveTimers.get(key);
  if (timer) clearTimeout(timer);
  latestEditors.set(key, authorId);
  saveTimers.set(key, setTimeout(async () => {
    saveTimers.delete(key);
    try { await persistDocument(roomCode, fileId, latestEditors.get(key)); } catch (error) { logger.error('Failed to persist CRDT state', { roomCode, fileId, message: error.message }); }
  }, SAVE_DEBOUNCE_MS));
};

const getAuthorizedRoom = async (socket, requireEdit = false) => {
  if (!socket.currentRoom || !socket.user?._id) return null;
  const room = await findRoomByCode(socket.currentRoom);
  if (!room || !room.members.some((member) => member.toString() === socket.user._id.toString()) && room.owner.toString() !== socket.user._id.toString()) return null;
  if (requireEdit && !canEdit(getMemberRole(room, socket.user._id))) return null;
  return room;
};

const withinOperationRate = (socket) => {
  const now = Date.now();
  const attempts = (socket._crdtOps || []).filter((timestamp) => timestamp >= now - OP_WINDOW_MS);
  if (attempts.length >= MAX_OPS_PER_WINDOW) return false;
  attempts.push(now); socket._crdtOps = attempts; return true;
};

const initializeCrdtSocket = (io) => {
  io.on('connection', (socket) => {
    let socketOperationQueue = Promise.resolve();

    socket.on('crdt-sync-request', async (data = {}, callback) => {
      try {
        const room = await getAuthorizedRoom(socket, false);
        if (!room) return callback?.({ error: 'Room membership required.' });
        const file = await resolveFile(room, data.fileId);
        if (data.fileId && !file) return callback?.({ error: 'Workspace file not found.' });
        const document = await getDocument(socket.currentRoom, data.fileId);
        if (!document) return callback?.({ error: 'Room not found.' });
        const key = keyFor(socket.currentRoom, data.fileId);
        const state = (isRedisReady() ? await getRedisState(key) : null) || serializeState(document.nodes);
        if (Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) return callback?.({ error: 'Collaborative document is too large to synchronize.' });
        socket.emit('crdt-sync', { state, version: 1, role: getRoomRole(room, socket.user._id), fileId: data.fileId || null });
        callback?.({ success: true, role: getRoomRole(room, socket.user._id), fileId: data.fileId || null });
      } catch (error) {
        logger.error('CRDT sync request failed', { message: error.message });
        callback?.({ error: 'Failed to synchronize collaborative document.' });
      }
    });

    socket.on('crdt-operation', (operation = {}, callback) => {
      const processOperation = async () => {
        try {
          const room = await getAuthorizedRoom(socket, true);
          if (!room) return callback?.({ error: 'Editor permission required.' });
          if (!withinOperationRate(socket)) return callback?.({ error: 'CRDT operation rate limit exceeded.' });
          if (!operation || operation.type !== 'replace') return callback?.({ error: 'Unsupported CRDT operation.' });
          const file = await resolveFile(room, operation.fileId);
          if (operation.fileId && !file) return callback?.({ error: 'Workspace file not found.' });
          const transportOperation = { ...operation }; delete transportOperation.fileId;
          if (Buffer.byteLength(JSON.stringify(operation), 'utf8') > MAX_OPERATION_BYTES) return callback?.({ error: 'CRDT operation is too large.' });
          const key = keyFor(socket.currentRoom, operation.fileId);

          await enqueueDocumentOperation(key, async () => {
            if (isRedisReady()) {
              const atomic = await applyOperationAtomic(key, transportOperation);
              if (atomic) {
                documents.set(key, buildDocument(atomic.state));
                schedulePersist(socket.currentRoom, operation.fileId, socket.user._id);
                socket.to(`room:${socket.currentRoom}`).emit('crdt-operation', operation);
                return callback?.({ success: true, changed: atomic.changed, textLength: atomic.text.length, fileId: operation.fileId || null });
              }
            }
            const document = await getDocument(socket.currentRoom, operation.fileId);
            if (!document) return callback?.({ error: 'Room not found.' });
            const changed = applyReplaceOperation(document.nodes, transportOperation);
            if (changed) {
              schedulePersist(socket.currentRoom, operation.fileId, socket.user._id);
              socket.to(`room:${socket.currentRoom}`).emit('crdt-operation', operation);
            }
            callback?.({ success: true, changed, textLength: visibleText(document.nodes).length, fileId: operation.fileId || null });
          });
        } catch (error) {
          logger.error('CRDT operation failed', { message: error.message });
          callback?.({ error: 'Failed to apply collaborative edit.' });
        }
      };

      socketOperationQueue = socketOperationQueue.then(processOperation, processOperation);
    });

    socket.on('disconnect', () => {
      if (socket.currentRoom) latestEditors.delete(socket.currentRoom);
    });
  });
};

module.exports = { initializeCrdtSocket, replaceDocumentState };
