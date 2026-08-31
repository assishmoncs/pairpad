// Shared room lookup, population and membership helpers.

const crypto = require('crypto');
const Room = require('../models/Room');
const { getMemberRole, ROLES } = require('./roomPermissions');

const USER_FIELDS = 'name email';
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const ROOM_DETAIL_FIELDS = 'name roomCode owner members memberRoles language description snapshotCode crdtState createdAt updatedAt';
const ROOM_LIST_FIELDS = 'name roomCode owner members memberRoles language description createdAt updatedAt';

const normalizeRoomCode = (roomCode) => {
  if (typeof roomCode !== 'string') return null;
  const normalized = roomCode.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
};

const populateRoom = (query, { includeDocumentState = true } = {}) => {
  const fields = includeDocumentState ? ROOM_DETAIL_FIELDS : ROOM_LIST_FIELDS;
  return query
    .select(fields)
    .populate('owner', USER_FIELDS)
    .populate('members', USER_FIELDS)
    .populate('memberRoles.user', USER_FIELDS);
};

const findRoomByCode = (roomCode, { populate = false, includeDocumentState = true } = {}) => {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized) return Promise.resolve(null);
  const query = Room.findOne({ roomCode: normalized });
  return populate ? populateRoom(query, { includeDocumentState }) : query;
};

const findPopulatedRoomById = (id, { includeDocumentState = true } = {}) =>
  populateRoom(Room.findById(id), { includeDocumentState });

const findPopulatedRoomsForMember = (userId) =>
  populateRoom(Room.find({ members: userId }), { includeDocumentState: false }).sort({ createdAt: -1 }).lean();

const refId = (ref) => (ref?._id || ref).toString();

const isRoomParticipant = (room, userId) => {
  const id = userId.toString();
  return room.members.some((member) => refId(member) === id) || refId(room.owner) === id;
};

const getRoomRole = (room, userId) => getMemberRole(room, userId);
const isRoomOwner = (room, userId) => getRoomRole(room, userId) === ROLES.OWNER;

const generateRoomCode = () => {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_CHARS.charAt(crypto.randomInt(ROOM_CODE_CHARS.length));
  }
  return code;
};

const generateUniqueRoomCode = async () => {
  for (;;) {
    const roomCode = generateRoomCode();
    if (!(await Room.exists({ roomCode }))) return roomCode;
  }
};

module.exports = {
  USER_FIELDS,
  normalizeRoomCode,
  populateRoom,
  findRoomByCode,
  findPopulatedRoomById,
  findPopulatedRoomsForMember,
  isRoomParticipant,
  getRoomRole,
  isRoomOwner,
  generateRoomCode,
  generateUniqueRoomCode,
};
