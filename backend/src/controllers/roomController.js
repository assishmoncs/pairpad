const Room = require('../models/Room');
const User = require('../models/User');

// Generate a random 6-character room code
const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// @desc    Create a new room
// @route   POST /api/rooms
// @access  Private
const createRoom = async (req, res) => {
  try {
    const { name, language, description } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        message: 'Room name is required.' 
      });
    }

    // Generate unique room code
    let roomCode = generateRoomCode();
    let existingRoom = await Room.findOne({ roomCode });
    
    while (existingRoom) {
      roomCode = generateRoomCode();
      existingRoom = await Room.findOne({ roomCode });
    }

    // Create room with owner as first member
    const room = await Room.create({
      name: name.trim(),
      roomCode,
      owner: req.user._id,
      members: [req.user._id],
      language: language || 'javascript',
      description: description?.trim() || '',
    });

    // Populate owner details
    const populatedRoom = await Room.findById(room._id)
      .populate('owner', 'name email')
      .populate('members', 'name email');

    res.status(201).json({
      message: 'Room created successfully.',
      data: {
        room: populatedRoom,
      },
    });
  } catch (error) {
    console.error('Create room error:', error.message);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed.',
        errors: messages,
      });
    }

    res.status(500).json({ 
      message: 'Failed to create room. Please try again.' 
    });
  }
};

// @desc    Get all rooms for current user
// @route   GET /api/rooms
// @access  Private
const getUserRooms = async (req, res) => {
  try {
    const rooms = await Room.find({
      members: req.user._id,
    })
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      message: 'Rooms retrieved successfully.',
      data: {
        rooms,
        count: rooms.length,
      },
    });
  } catch (error) {
    console.error('Get user rooms error:', error.message);
    res.status(500).json({ 
      message: 'Failed to retrieve rooms. Please try again.' 
    });
  }
};

// @desc    Get room by ID or room code
// @route   GET /api/rooms/:identifier
// @access  Private
const getRoom = async (req, res) => {
  try {
    const { identifier } = req.params;

    // Try to find by roomCode first, then by _id
    let room = await Room.findOne({ roomCode: identifier.toUpperCase() })
      .populate('owner', 'name email')
      .populate('members', 'name email');

    if (!room) {
      room = await Room.findById(identifier)
        .populate('owner', 'name email')
        .populate('members', 'name email');
    }

    if (!room) {
      return res.status(404).json({ 
        message: 'Room not found.' 
      });
    }

    // Check if user is a member
    const isMember = room.members.some(
      member => member._id.toString() === req.user._id.toString()
    );

    if (!isMember && room.owner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        message: 'You are not authorized to access this room.' 
      });
    }

    res.json({
      message: 'Room retrieved successfully.',
      data: {
        room,
      },
    });
  } catch (error) {
    console.error('Get room error:', error.message);
    
    if (error.name === 'CastError') {
      return res.status(404).json({ 
        message: 'Room not found.' 
      });
    }

    res.status(500).json({ 
      message: 'Failed to retrieve room. Please try again.' 
    });
  }
};

// @desc    Join a room by room code
// @route   POST /api/rooms/:roomCode/join
// @access  Private
const joinRoom = async (req, res) => {
  try {
    const { roomCode } = req.params;

    const room = await Room.findOne({ 
      roomCode: roomCode.toUpperCase() 
    });

    if (!room) {
      return res.status(404).json({ 
        message: 'Room not found.' 
      });
    }

    // Check if already a member
    const isMember = room.members.some(
      member => member.toString() === req.user._id.toString()
    );

    if (isMember) {
      return res.json({
        message: 'You are already a member of this room.',
        data: {
          room: await Room.findById(room._id)
            .populate('owner', 'name email')
            .populate('members', 'name email'),
        },
      });
    }

    // Add user to members
    room.members.push(req.user._id);
    await room.save();

    const updatedRoom = await Room.findById(room._id)
      .populate('owner', 'name email')
      .populate('members', 'name email');

    res.json({
      message: 'Successfully joined the room.',
      data: {
        room: updatedRoom,
      },
    });
  } catch (error) {
    console.error('Join room error:', error.message);
    res.status(500).json({ 
      message: 'Failed to join room. Please try again.' 
    });
  }
};

// @desc    Leave a room
// @route   POST /api/rooms/:roomCode/leave
// @access  Private
const leaveRoom = async (req, res) => {
  try {
    const { roomCode } = req.params;

    const room = await Room.findOne({ 
      roomCode: roomCode.toUpperCase() 
    });

    if (!room) {
      return res.status(404).json({ 
        message: 'Room not found.' 
      });
    }

    // Owner cannot leave (must transfer ownership or delete room)
    if (room.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ 
        message: 'Room owner cannot leave. Transfer ownership or delete the room instead.' 
      });
    }

    // Remove user from members
    room.members = room.members.filter(
      member => member.toString() !== req.user._id.toString()
    );
    await room.save();

    res.json({
      message: 'Successfully left the room.',
    });
  } catch (error) {
    console.error('Leave room error:', error.message);
    res.status(500).json({ 
      message: 'Failed to leave room. Please try again.' 
    });
  }
};

// @desc    Delete a room (owner only)
// @route   DELETE /api/rooms/:roomCode
// @access  Private
const deleteRoom = async (req, res) => {
  try {
    const { roomCode } = req.params;

    const room = await Room.findOne({ 
      roomCode: roomCode.toUpperCase() 
    });

    if (!room) {
      return res.status(404).json({ 
        message: 'Room not found.' 
      });
    }

    // Check ownership
    if (room.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        message: 'Only the room owner can delete this room.' 
      });
    }

    await Room.deleteOne({ _id: room._id });

    res.json({
      message: 'Room deleted successfully.',
    });
  } catch (error) {
    console.error('Delete room error:', error.message);
    res.status(500).json({ 
      message: 'Failed to delete room. Please try again.' 
    });
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
