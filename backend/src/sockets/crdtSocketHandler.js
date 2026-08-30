const Room = require('../models/Room');
const logger = require('../utils/logger');
const { findRoomByCode, isRoomParticipant, normalizeRoomCode } = require('../utils/roomAccess');
const {
  createInitialState,
  deserializeState,
  serializeState,
  visibleText,
  applyReplaceOperation,
} = require('../services/textCrdt');

const MAX_OPERATION_BYTES = 256 * 1024;
const MAX_STATE_BYTES = 4 * 1024 * 1024;
const SAVE_DEBOUNCE_MS = 750;
const OP_WINDOW_MS = 60 * 1000;
const MAX_OPS_PER_WINDOW = 600;

const documents = new Map();
const saveTimers = new Map();

const getDocument = async (roomCode) => {
  const normalized = normalizeRoomCode(roomCode);
  if (documents.has(normalized)) return documents.get(normalized);
  const room = await findRoomByCode(normalized);
  if (!room) return null;
  const nodes = room.crdtState ? deserializeState(room.crdtState) : createInitialState(room.snapshotCode || '');
  const document = { nodes };
  documents.set(normalized, document);
  return document;
};

const schedulePersist = (roomCode) => {
  const timer = saveTimers.get(roomCode);
  if (timer) clearTimeout(timer);
  saveTimers.set(roomCode, setTimeout(async () => {
    saveTimers.delete(roomCode);
    const document = documents.get(roomCode);
    if (!document) return;
    try {
      const serialized = serializeState(document.nodes);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) {
        logger.error('CRDT state exceeded maximum persistence size', { roomCode });
        return;
      }
      await Room.updateOne({ roomCode }, { $set: { crdtState: serialized, snapshotCode: visibleText(document.nodes) } });
    } catch (error) {
      logger.error('Failed to persist CRDT state', { roomCode, message: error.message });
    }
  }, SAVE_DEBOUNCE_MS));
};

const isMember = async (socket) => {
  if (!socket.currentRoom || !socket.user?._id) return false;
  const room = await findRoomByCode(socket.currentRoom);
  return Boolean(room && isRoomParticipant(room, socket.user._id));
};

const withinOperationRate = (socket) => {
  const now = Date.now();
  const windowStart = now - OP_WINDOW_MS;
  const attempts = (socket._crdtOps || []).filter((timestamp) => timestamp >= windowStart);
  if (attempts.length >= MAX_OPS_PER_WINDOW) return false;
  attempts.push(now);
  socket._crdtOps = attempts;
  return true;
};

/** Attach CRDT events to the existing authenticated Socket.IO server. */
const initializeCrdtSocket = (io) => {
  io.on('connection', (socket) => {
    socket.on('crdt-sync-request', async (_data, callback) => {
      try {
        if (!(await isMember(socket))) return callback?.({ error: 'Room membership required.' });
        const document = await getDocument(socket.currentRoom);
        if (!document) return callback?.({ error: 'Room not found.' });
        const state = serializeState(document.nodes);
        if (Buffer.byteLength(state, 'utf8') > MAX_STATE_BYTES) {
          return callback?.({ error: 'Collaborative document is too large to synchronize.' });
        }
        socket.emit('crdt-sync', { state, version: 1 });
        callback?.({ success: true });
      } catch (error) {
        logger.error('CRDT sync request failed', { message: error.message });
        callback?.({ error: 'Failed to synchronize collaborative document.' });
      }
    });

    socket.on('crdt-operation', async (operation, callback) => {
      try {
        if (!(await isMember(socket))) return callback?.({ error: 'Room membership required.' });
        if (!withinOperationRate(socket)) return callback?.({ error: 'CRDT operation rate limit exceeded.' });
        if (!operation || operation.type !== 'replace') return callback?.({ error: 'Unsupported CRDT operation.' });
        const size = Buffer.byteLength(JSON.stringify(operation), 'utf8');
        if (size > MAX_OPERATION_BYTES) return callback?.({ error: 'CRDT operation is too large.' });

        const document = await getDocument(socket.currentRoom);
        if (!document) return callback?.({ error: 'Room not found.' });
        const changed = applyReplaceOperation(document.nodes, operation);
        if (changed) {
          schedulePersist(socket.currentRoom);
          socket.to(`room:${socket.currentRoom}`).emit('crdt-operation', operation);
        }
        callback?.({ success: true, changed, textLength: visibleText(document.nodes).length });
      } catch (error) {
        logger.error('CRDT operation failed', { message: error.message });
        callback?.({ error: 'Failed to apply collaborative edit.' });
      }
    });
  });
};

module.exports = { initializeCrdtSocket };
