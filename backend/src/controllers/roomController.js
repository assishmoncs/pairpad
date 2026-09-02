const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Room = require('../models/Room');
const Message = require('../models/Message');
const Revision = require('../models/Revision');
const WorkspaceFile = require('../models/WorkspaceFile');
const { deleteState } = require('../services/redisDocumentState');
const { validateRoomName, sanitizeString } = require('../utils/validation');
const { sendSuccess, sendError, sendValidationError } = require('../utils/apiResponse');
const { ROLES, getMemberRole } = require('../utils/roomPermissions');
const {
  findRoomByCode,
  findPopulatedRoomById,
  findPopulatedRoomsForMember,
  generateUniqueRoomCode,
  isRoomParticipant,
} = require('../utils/roomAccess');

const enrichRoomForUser = (room, userId) => {
  const role = getMemberRole(room, userId);
  const plain = room?.toObject ? room.toObject() : room;
  return { ...plain, currentUserRole: role };
};

const createRoom = async (req, res) => {
  try {
    const { name, language, description } = req.body;
    const nameCheck = validateRoomName(name);
    if (!nameCheck.valid) return sendError(res, 400, nameCheck.error);
    if (language !== undefined && typeof language !== 'string') return sendError(res, 400, 'Language must be a string.');
    if (description !== undefined && typeof description !== 'string') return sendError(res, 400, 'Description must be a string.');

    const roomCode = await generateUniqueRoomCode();
    const room = await Room.create({
      name: nameCheck.value,
      roomCode,
      owner: req.user._id,
      members: [req.user._id],
      memberRoles: [{ user: req.user._id, role: ROLES.OWNER }],
      language: language || 'javascript',
      description: sanitizeString(description || '').substring(0, 200),
    });

    const populatedRoom = await findPopulatedRoomById(room._id);
    sendSuccess(res, 'Room created successfully.', { room: enrichRoomForUser(populatedRoom, req.user._id) }, { status: 201 });
  } catch (error) {
    logger.error('Create room error', { message: error.message });
    if (error.name === 'ValidationError') return sendValidationError(res, error);
    sendError(res, 500, 'Failed to create room. Please try again.');
  }
};

const getUserRooms = async (req, res) => {
  try {
    const rooms = await findPopulatedRoomsForMember(req.user._id);
    sendSuccess(res, 'Rooms retrieved successfully.', {
      rooms: rooms.map((room) => enrichRoomForUser(room, req.user._id)),
      count: rooms.length,
    });
  } catch (error) {
    logger.error('Get user rooms error', { message: error.message });
    sendError(res, 500, 'Failed to retrieve rooms. Please try again.');
  }
};

const getRoom = async (req, res) => {
  try {
    const { identifier } = req.params;
    let room = await findRoomByCode(identifier, { populate: true });
    if (!room && mongoose.isValidObjectId(identifier)) room = await findPopulatedRoomById(identifier);
    if (!room) return sendError(res, 404, 'Room not found.');
    if (!isRoomParticipant(room, req.user._id)) return sendError(res, 403, 'You are not authorized to access this room.');
    sendSuccess(res, 'Room retrieved successfully.', { room: enrichRoomForUser(room, req.user._id) });
  } catch (error) {
    logger.error('Get room error', { message: error.message });
    if (error.name === 'CastError') return sendError(res, 404, 'Room not found.');
    sendError(res, 500, 'Failed to retrieve room. Please try again.');
  }
};

const joinRoom = async (req, res) => {
  try {
    const room = await findRoomByCode(req.params.roomCode);
    if (!room) return sendError(res, 404, 'Room not found.');
    const id = req.user._id.toString();
    const isMember = room.members.some((member) => member.toString() === id);
    if (isMember) {
      const existing = await findPopulatedRoomById(room._id);
      return sendSuccess(res, 'You are already a member of this room.', { room: enrichRoomForUser(existing, req.user._id) });
    }

    room.members.push(req.user._id);
    room.memberRoles.push({ user: req.user._id, role: ROLES.EDITOR });
    await room.save();
    const populated = await findPopulatedRoomById(room._id);
    sendSuccess(res, 'Successfully joined the room.', { room: enrichRoomForUser(populated, req.user._id) });
  } catch (error) {
    logger.error('Join room error', { message: error.message });
    sendError(res, 500, 'Failed to join room. Please try again.');
  }
};

const leaveRoom = async (req, res) => {
  try {
    const room = await findRoomByCode(req.params.roomCode);
    if (!room) return sendError(res, 404, 'Room not found.');
    if (getMemberRole(room, req.user._id) === ROLES.OWNER) {
      return sendError(res, 400, 'Room owner cannot leave. Transfer ownership or delete the room instead.');
    }

    const id = req.user._id.toString();
    room.members = room.members.filter((member) => member.toString() !== id);
    room.memberRoles = room.memberRoles.filter((entry) => entry.user.toString() !== id);
    await room.save();
    sendSuccess(res, 'Successfully left the room.');
  } catch (error) {
    logger.error('Leave room error', { message: error.message });
    sendError(res, 500, 'Failed to leave room. Please try again.');
  }
};

const transferOwnership = async (req, res) => {
  try {
    const { userId: nextOwnerId } = req.body;
    const room = await findRoomByCode(req.params.roomCode);
    if (!room) return sendError(res, 404, 'Room not found.');
    if (getMemberRole(room, req.user._id) !== ROLES.OWNER) return sendError(res, 403, 'Only the room owner can transfer ownership.');
    if (!nextOwnerId || typeof nextOwnerId !== 'string') return sendError(res, 400, 'A target userId is required to transfer ownership.');
    if (!mongoose.isValidObjectId(nextOwnerId)) return sendError(res, 400, 'Invalid userId.');
    if (!room.members.some((member) => member.toString() === nextOwnerId)) return sendError(res, 400, 'The target user must be a member of the room.');
    if (room.owner.toString() === nextOwnerId) return sendError(res, 400, 'The target user already owns this room.');

    const oldOwnerId = room.owner.toString();
    room.owner = nextOwnerId;
    const oldRole = room.memberRoles.find((entry) => entry.user.toString() === oldOwnerId);
    if (oldRole) oldRole.role = ROLES.EDITOR;
    else room.memberRoles.push({ user: oldOwnerId, role: ROLES.EDITOR });
    const newRole = room.memberRoles.find((entry) => entry.user.toString() === nextOwnerId);
    if (newRole) newRole.role = ROLES.OWNER;
    else room.memberRoles.push({ user: nextOwnerId, role: ROLES.OWNER });
    await room.save();

    const populatedRoom = await findPopulatedRoomById(room._id);
    sendSuccess(res, 'Ownership transferred successfully.', { room: enrichRoomForUser(populatedRoom, req.user._id) });
  } catch (error) {
    logger.error('Transfer ownership error', { message: error.message });
    if (error.name === 'CastError') return sendError(res, 400, 'Invalid userId.');
    sendError(res, 500, 'Failed to transfer ownership. Please try again.');
  }
};

const updateMemberRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!Object.values(ROLES).includes(role) || role === ROLES.OWNER) return sendError(res, 400, 'Role must be editor or viewer.');
    if (!mongoose.isValidObjectId(userId)) return sendError(res, 400, 'Invalid userId.');

    const room = await findRoomByCode(req.params.roomCode);
    if (!room) return sendError(res, 404, 'Room not found.');
    if (getMemberRole(room, req.user._id) !== ROLES.OWNER) return sendError(res, 403, 'Only the room owner can change member roles.');
    if (!room.members.some((member) => member.toString() === userId)) return sendError(res, 404, 'Target user is not a member of this room.');
    if (room.owner.toString() === userId) return sendError(res, 400, 'The room owner must retain the owner role.');

    let entry = room.memberRoles.find((candidate) => candidate.user.toString() === userId);
    if (!entry) room.memberRoles.push({ user: userId, role });
    else entry.role = role;
    await room.save();

    const populatedRoom = await findPopulatedRoomById(room._id);
    req.app.get('io')?.to(`room:${room.roomCode}`).emit('member-role-updated', { userId, role });
    sendSuccess(res, 'Member role updated successfully.', { room: enrichRoomForUser(populatedRoom, req.user._id) });
  } catch (error) {
    logger.error('Update member role error', { message: error.message });
    if (error.name === 'CastError') return sendError(res, 400, 'Invalid userId.');
    sendError(res, 500, 'Failed to update member role. Please try again.');
  }
};

const deleteRoom = async (req, res) => {
  try {
    const room = await findRoomByCode(req.params.roomCode);
    if (!room) return sendError(res, 404, 'Room not found.');
    if (getMemberRole(room, req.user._id) !== ROLES.OWNER) return sendError(res, 403, 'Only the room owner can delete this room.');

    await Promise.all([
      Message.deleteMany({ room: room._id }),
      Revision.deleteMany({ room: room._id }),
      WorkspaceFile.deleteMany({ room: room._id }),
      Room.deleteOne({ _id: room._id }),
      deleteState(room.roomCode),
    ]);
    req.app.get('io')?.to(`room:${room.roomCode}`).emit('room-deleted', { roomCode: room.roomCode });
    sendSuccess(res, 'Room deleted successfully.');
  } catch (error) {
    logger.error('Delete room error', { message: error.message });
    sendError(res, 500, 'Failed to delete room. Please try again.');
  }
};

module.exports = {
  createRoom,
  getUserRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  transferOwnership,
  updateMemberRole,
  deleteRoom,
};
