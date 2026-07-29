const mongoose = require('mongoose');
const Room = require('../models/Room');
const { validateRoomName, sanitizeString } = require('../utils/validation');
const { sendSuccess, sendError, sendValidationError } = require('../utils/apiResponse');
const {
  findRoomByCode,
  findPopulatedRoomById,
  findPopulatedRoomsForMember,
  generateUniqueRoomCode,
  isRoomParticipant,
} = require('../utils/roomAccess');

// @desc    Create a new room
// @route   POST /api/rooms
// @access  Private
const createRoom = async (req, res) => {
  try {
    const { name, language, description } = req.body;

    const nameCheck = validateRoomName(name);
    if (!nameCheck.valid) {
      return sendError(res, 400, nameCheck.error);
    }

    if (language !== undefined && typeof language !== 'string') {
      return sendError(res, 400, 'Language must be a string.');
    }

    if (description !== undefined && typeof description !== 'string') {
      return sendError(res, 400, 'Description must be a string.');
    }

    const roomCode = await generateUniqueRoomCode();

    // Create room with owner as first member
    const room = await Room.create({
      name: nameCheck.value,
      roomCode,
      owner: req.user._id,
      members: [req.user._id],
      language: language || 'javascript',
      description: sanitizeString(description || '').substring(0, 200),
    });

    const populatedRoom = await findPopulatedRoomById(room._id);

    sendSuccess(res, 'Room created successfully.', { room: populatedRoom }, { status: 201 });
  } catch (error) {
    console.error('Create room error:', error.message);

    if (error.name === 'ValidationError') {
      return sendValidationError(res, error);
    }

    sendError(res, 500, 'Failed to create room. Please try again.');
  }
};

// @desc    Get all rooms for current user
// @route   GET /api/rooms
// @access  Private
const getUserRooms = async (req, res) => {
  try {
    const rooms = await findPopulatedRoomsForMember(req.user._id);

    sendSuccess(res, 'Rooms retrieved successfully.', {
      rooms,
      count: rooms.length,
    });
  } catch (error) {
    console.error('Get user rooms error:', error.message);
    sendError(res, 500, 'Failed to retrieve rooms. Please try again.');
  }
};

// @desc    Get room by ID or room code
// @route   GET /api/rooms/:identifier
// @access  Private
const getRoom = async (req, res) => {
  try {
    const { identifier } = req.params;

    // Try to find by roomCode first, then by _id
    let room = await findRoomByCode(identifier, { populate: true });

    if (!room && mongoose.isValidObjectId(identifier)) {
      room = await findPopulatedRoomById(identifier);
    }

    if (!room) {
      return sendError(res, 404, 'Room not found.');
    }

    if (!isRoomParticipant(room, req.user._id)) {
      return sendError(res, 403, 'You are not authorized to access this room.');
    }

    sendSuccess(res, 'Room retrieved successfully.', { room });
  } catch (error) {
    console.error('Get room error:', error.message);

    if (error.name === 'CastError') {
      return sendError(res, 404, 'Room not found.');
    }

    sendError(res, 500, 'Failed to retrieve room. Please try again.');
  }
};

// @desc    Join a room by room code
// @route   POST /api/rooms/:roomCode/join
// @access  Private
const joinRoom = async (req, res) => {
  try {
    const room = await findRoomByCode(req.params.roomCode);

    if (!room) {
      return sendError(res, 404, 'Room not found.');
    }

    // Check if already a member
    const isMember = room.members.some(
      (member) => member.toString() === req.user._id.toString()
    );

    if (isMember) {
      return sendSuccess(res, 'You are already a member of this room.', {
        room: await findPopulatedRoomById(room._id),
      });
    }

    // Add user to members
    room.members.push(req.user._id);
    await room.save();

    sendSuccess(res, 'Successfully joined the room.', {
      room: await findPopulatedRoomById(room._id),
    });
  } catch (error) {
    console.error('Join room error:', error.message);
    sendError(res, 500, 'Failed to join room. Please try again.');
  }
};

// @desc    Leave a room
// @route   POST /api/rooms/:roomCode/leave
// @access  Private
const leaveRoom = async (req, res) => {
  try {
    const room = await findRoomByCode(req.params.roomCode);

    if (!room) {
      return sendError(res, 404, 'Room not found.');
    }

    // Owner cannot leave (must transfer ownership or delete room)
    if (room.owner.toString() === req.user._id.toString()) {
      return sendError(
        res,
        400,
        'Room owner cannot leave. Transfer ownership or delete the room instead.'
      );
    }

    // Remove user from members
    room.members = room.members.filter(
      (member) => member.toString() !== req.user._id.toString()
    );
    await room.save();

    sendSuccess(res, 'Successfully left the room.');
  } catch (error) {
    console.error('Leave room error:', error.message);
    sendError(res, 500, 'Failed to leave room. Please try again.');
  }
};

// @desc    Delete a room (owner only)
// @route   DELETE /api/rooms/:roomCode
// @access  Private
const deleteRoom = async (req, res) => {
  try {
    const room = await findRoomByCode(req.params.roomCode);

    if (!room) {
      return sendError(res, 404, 'Room not found.');
    }

    // Check ownership
    if (room.owner.toString() !== req.user._id.toString()) {
      return sendError(res, 403, 'Only the room owner can delete this room.');
    }

    await Room.deleteOne({ _id: room._id });

    sendSuccess(res, 'Room deleted successfully.');
  } catch (error) {
    console.error('Delete room error:', error.message);
    sendError(res, 500, 'Failed to delete room. Please try again.');
  }
};

module.exports = {
  createRoom,
  getUserRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  deleteRoom,
};
