// Shared room lookup, population and membership helpers.

const crypto = require('crypto');
const Room = require('../models/Room');

const USER_FIELDS = 'name email';
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

/**
 * Normalize a user supplied room code to its stored form.
 * Returns null for anything that is not a well formed code, so unvalidated
 * input never reaches the database as a query value.
 */
const normalizeRoomCode = (roomCode) => {
  if (typeof roomCode !== 'string') return null;
  const normalized = roomCode.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
};

/** Populate owner and members with their public fields. */
const populateRoom = (query) =>
  query.populate('owner', USER_FIELDS).populate('members', USER_FIELDS);

/**
 * Find a room by its (possibly unnormalized) room code.
 * @param {string} roomCode
 * @param {{populate?: boolean}} [options]
 */
const findRoomByCode = (roomCode, { populate = false } = {}) => {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized) return Promise.resolve(null);

  const query = Room.findOne({ roomCode: normalized });
  return populate ? populateRoom(query) : query;
};

/** Find a room by id with owner and members populated. */
const findPopulatedRoomById = (id) => populateRoom(Room.findById(id));

/** List the rooms a user belongs to, newest first, with owner and members populated. */
const findPopulatedRoomsForMember = (userId) =>
  populateRoom(Room.find({ members: userId })).sort({ createdAt: -1 });

/** Read the id of a reference that may be populated or a raw ObjectId. */
const refId = (ref) => (ref?._id || ref).toString();

/**
 * Check whether a user owns or is a member of a room.
 * Works with populated and unpopulated owner/member references.
 */
const isRoomParticipant = (room, userId) => {
  const id = userId.toString();
  return room.members.some((member) => refId(member) === id) || refId(room.owner) === id;
};

/** Generate a random room code. Codes double as invite tokens, so use a CSPRNG. */
const generateRoomCode = () => {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS.charAt(crypto.randomInt(ROOM_CODE_CHARS.length));
  }
  return code;
};

/** Generate a room code that is not yet used by an existing room. */
const generateUniqueRoomCode = async () => {
  let roomCode = generateRoomCode();
  while (await Room.exists({ roomCode })) {
    roomCode = generateRoomCode();
  }
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
  generateRoomCode,
  generateUniqueRoomCode,
};
