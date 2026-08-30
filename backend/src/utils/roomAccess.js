// Shared room lookup, population and membership helpers.

const crypto = require('crypto');
const Room = require('../models/Room');
const { getMemberRole, ROLES } = require('./roomPermissions');

const USER_FIELDS = 'name email';
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

const normalizeRoomCode = (roomCode) => {
  if (typeof roomCode !== 'string') return null;
  const normalized = roomCode.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
};

const populateRoom = (query) =>
  query.populate('owner', USER_FIELDS).populate('members', USER_FIELDS).populate('memberRoles.user', USER_FIELDS);

const findRoomByCode = (roomCode, { populate = false } = {}) => {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized) return Promise.resolve(null);
  const query = Room.findOne({ roomCode: normalized });
  return populate ? populateRoom(query) : query;
};

const findPopulatedRoomById = (id) => populateRoom(Room.findById(id));
const findPopulatedRoomsForMember = (userId) =>
  populateRoom(Room.find({ members: userId })).sort({ createdAt: -1 });
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
  let roomCode = generateRoomCode();
  while (await Room.exists({ roomCode })) roomCode = generateRoomCode();
  return roomCode;
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
