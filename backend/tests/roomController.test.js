jest.mock('../src/models/Room', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  deleteOne: jest.fn(),
  exists: jest.fn(),
}));
jest.mock('../src/models/User', () => ({}));
jest.mock('../src/models/Message', () => ({
  deleteMany: jest.fn(),
}));

const Room = require('../src/models/Room');
const Message = require('../src/models/Message');
const {
  createRoom,
  getUserRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  deleteRoom,
} = require('../src/controllers/roomController');

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createReq = (overrides = {}) => ({
  body: {},
  params: {},
  user: { _id: USER_ID },
  app: { get: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })) },
  ...overrides,
});

// Mimics Room.findById(...).populate(...).populate(...) chains.
const populated = (room) => ({
  populate: jest.fn().mockReturnValue({
    populate: jest.fn().mockResolvedValue(room),
  }),
});

// Mimics Room.find(...).populate(...).populate(...).sort(...) chains.
const populatedList = (rooms) => ({
  populate: jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue(rooms),
    }),
  }),
});

let consoleError;

beforeEach(() => {
  jest.resetAllMocks();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('createRoom', () => {
  it('rejects a missing or blank name', async () => {
    const res = createRes();

    await createRoom(createReq({ body: { name: '   ' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Room name cannot be empty.' });
    expect(Room.create).not.toHaveBeenCalled();
  });

  it('creates a room with a unique 6-character code and the owner as a member', async () => {
    Room.exists.mockResolvedValue(null);
    Room.create.mockResolvedValue({ _id: 'room-1' });
    const populatedRoom = { _id: 'room-1', name: 'My Room' };
    Room.findById.mockReturnValue(populated(populatedRoom));
    const res = createRes();

    await createRoom(
      createReq({ body: { name: '  My Room  ', language: 'python', description: ' hi ' } }),
      res
    );

    const created = Room.create.mock.calls[0][0];
    expect(created).toMatchObject({
      name: 'My Room',
      owner: USER_ID,
      members: [USER_ID],
      language: 'python',
      description: 'hi',
    });
    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Room created successfully.',
      data: { room: populatedRoom },
    });
  });

  it('defaults language to javascript and description to an empty string', async () => {
    Room.exists.mockResolvedValue(null);
    Room.create.mockResolvedValue({ _id: 'room-1' });
    Room.findById.mockReturnValue(populated({}));

    await createRoom(createReq({ body: { name: 'Room' } }), createRes());

    expect(Room.create).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'javascript', description: '' })
    );
  });

  it('regenerates the room code until an unused one is found', async () => {
    Room.exists
      .mockResolvedValueOnce({ _id: 'taken' })
      .mockResolvedValueOnce({ _id: 'taken' })
      .mockResolvedValueOnce(null);
    Room.create.mockResolvedValue({ _id: 'room-1' });
    Room.findById.mockReturnValue(populated({}));

    await createRoom(createReq({ body: { name: 'Room' } }), createRes());

    expect(Room.exists).toHaveBeenCalledTimes(3);
    expect(Room.create).toHaveBeenCalledTimes(1);
  });

  it('surfaces Mongoose validation errors as 400', async () => {
    Room.exists.mockResolvedValue(null);
    const error = new Error('invalid');
    error.name = 'ValidationError';
    error.errors = { name: { message: 'Room name is required' } };
    Room.create.mockRejectedValue(error);
    const res = createRes();

    await createRoom(createReq({ body: { name: 'Room' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Validation failed.',
      errors: ['Room name is required'],
    });
  });

  it('returns 500 on unexpected failures', async () => {
    Room.exists.mockRejectedValue(new Error('db down'));
    const res = createRes();

    await createRoom(createReq({ body: { name: 'Room' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to create room. Please try again.',
    });
  });
});

describe('getUserRooms', () => {
  it('returns the rooms the user belongs to with a count', async () => {
    const rooms = [{ _id: 'a' }, { _id: 'b' }];
    Room.find.mockReturnValue(populatedList(rooms));
    const res = createRes();

    await getUserRooms(createReq(), res);

    expect(Room.find).toHaveBeenCalledWith({ members: USER_ID });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Rooms retrieved successfully.',
      data: { rooms, count: 2 },
    });
  });

  it('returns 500 when the query fails', async () => {
    Room.find.mockImplementation(() => {
      throw new Error('db down');
    });
    const res = createRes();

    await getUserRooms(createReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to retrieve rooms. Please try again.',
    });
  });
});

describe('getRoom', () => {
  const membership = (memberIds, ownerId) => ({
    members: memberIds.map((id) => ({ _id: { toString: () => id } })),
    owner: { _id: { toString: () => ownerId } },
  });

  it('looks a room up by its code, uppercased', async () => {
    const room = membership([USER_ID], USER_ID);
    Room.findOne.mockReturnValue(populated(room));
    const res = createRes();

    await getRoom(createReq({ params: { identifier: 'abc123' } }), res);

    expect(Room.findOne).toHaveBeenCalledWith({ roomCode: 'ABC123' });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Room retrieved successfully.',
      data: { room },
    });
  });

  it('falls back to an id lookup when no room matches the code', async () => {
    const roomId = '507f1f77bcf86cd799439011';
    const room = membership([USER_ID], OTHER_ID);
    Room.findOne.mockReturnValue(populated(null));
    Room.findById.mockReturnValue(populated(room));
    const res = createRes();

    await getRoom(createReq({ params: { identifier: roomId } }), res);

    expect(Room.findById).toHaveBeenCalledWith(roomId);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { room } })
    );
  });

  it('does not query by id for an identifier that is neither a room code nor an ObjectId', async () => {
    const res = createRes();

    await getRoom(createReq({ params: { identifier: 'not-a-room-id' } }), res);

    expect(Room.findOne).not.toHaveBeenCalled();
    expect(Room.findById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when neither lookup matches', async () => {
    Room.findOne.mockReturnValue(populated(null));
    Room.findById.mockReturnValue(populated(null));
    const res = createRes();

    await getRoom(createReq({ params: { identifier: 'nope' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Room not found.' });
  });

  it('returns 403 for a user who is neither member nor owner', async () => {
    Room.findOne.mockReturnValue(populated(membership([OTHER_ID], OTHER_ID)));
    const res = createRes();

    await getRoom(createReq({ params: { identifier: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'You are not authorized to access this room.',
    });
  });

  it('treats a CastError as a 404', async () => {
    Room.findOne.mockReturnValue(populated(null));
    const castError = new Error('Cast to ObjectId failed');
    castError.name = 'CastError';
    Room.findById.mockImplementation(() => {
      throw castError;
    });
    const res = createRes();

    await getRoom(createReq({ params: { identifier: '507f1f77bcf86cd799439011' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Room not found.' });
  });

  it('returns 500 on unexpected failures', async () => {
    Room.findOne.mockImplementation(() => {
      throw new Error('db down');
    });
    const res = createRes();

    await getRoom(createReq({ params: { identifier: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to retrieve room. Please try again.',
    });
  });
});

describe('joinRoom', () => {
  it('returns 404 for an unknown room code', async () => {
    Room.findOne.mockResolvedValue(null);
    const res = createRes();

    await joinRoom(createReq({ params: { roomCode: 'abc123' } }), res);

    expect(Room.findOne).toHaveBeenCalledWith({ roomCode: 'ABC123' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('is a no-op for a user who already joined', async () => {
    const room = {
      _id: 'room-1',
      members: [{ toString: () => USER_ID }],
      save: jest.fn(),
    };
    Room.findOne.mockResolvedValue(room);
    const fullRoom = { _id: 'room-1' };
    Room.findById.mockReturnValue(populated(fullRoom));
    const res = createRes();

    await joinRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(room.save).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'You are already a member of this room.',
      data: { room: fullRoom },
    });
  });

  it('adds a new member and returns the updated room', async () => {
    const room = {
      _id: 'room-1',
      members: [{ toString: () => OTHER_ID }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    Room.findOne.mockResolvedValue(room);
    const fullRoom = { _id: 'room-1' };
    Room.findById.mockReturnValue(populated(fullRoom));
    const res = createRes();

    await joinRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(room.members).toContain(USER_ID);
    expect(room.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Successfully joined the room.',
      data: { room: fullRoom },
    });
  });

  it('returns 500 when the join fails', async () => {
    Room.findOne.mockRejectedValue(new Error('db down'));
    const res = createRes();

    await joinRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to join room. Please try again.',
    });
  });
});

describe('leaveRoom', () => {
  it('returns 404 for an unknown room code', async () => {
    Room.findOne.mockResolvedValue(null);
    const res = createRes();

    await leaveRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('prevents the owner from leaving', async () => {
    Room.findOne.mockResolvedValue({
      owner: { toString: () => USER_ID },
      members: [],
      save: jest.fn(),
    });
    const res = createRes();

    await leaveRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message:
        'Room owner cannot leave. Transfer ownership or delete the room instead.',
    });
  });

  it('removes the member and saves the room', async () => {
    const room = {
      owner: { toString: () => OTHER_ID },
      members: [{ toString: () => USER_ID }, { toString: () => OTHER_ID }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    Room.findOne.mockResolvedValue(room);
    const res = createRes();

    await leaveRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(room.members).toHaveLength(1);
    expect(room.members[0].toString()).toBe(OTHER_ID);
    expect(room.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Successfully left the room.',
    });
  });

  it('returns 500 when the leave fails', async () => {
    Room.findOne.mockRejectedValue(new Error('db down'));
    const res = createRes();

    await leaveRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to leave room. Please try again.',
    });
  });
});

describe('deleteRoom', () => {
  it('returns 404 for an unknown room code', async () => {
    Room.findOne.mockResolvedValue(null);
    const res = createRes();

    await deleteRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 for a non-owner', async () => {
    Room.findOne.mockResolvedValue({
      _id: 'room-1',
      owner: { toString: () => OTHER_ID },
    });
    const res = createRes();

    await deleteRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Only the room owner can delete this room.',
    });
    expect(Room.deleteOne).not.toHaveBeenCalled();
    expect(Message.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes the room for its owner', async () => {
    Room.findOne.mockResolvedValue({
      _id: 'room-1',
      owner: { toString: () => USER_ID },
      roomCode: 'ABC123',
    });
    Message.deleteMany.mockResolvedValue({ deletedCount: 2 });
    Room.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const res = createRes();

    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));

    await deleteRoom(
      createReq({
        params: { roomCode: 'ABC123' },
        app: { get: jest.fn(() => ({ to })) },
      }),
      res
    );

    expect(Message.deleteMany).toHaveBeenCalledWith({ room: 'room-1' });
    expect(Room.deleteOne).toHaveBeenCalledWith({ _id: 'room-1' });
    expect(to).toHaveBeenCalledWith('room:ABC123');
    expect(emit).toHaveBeenCalledWith('room-deleted', { roomCode: 'ABC123' });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Room deleted successfully.',
    });
  });

  it('returns 500 when the delete fails', async () => {
    Room.findOne.mockResolvedValue({
      _id: 'room-1',
      owner: { toString: () => USER_ID },
    });
    Message.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Room.deleteOne.mockRejectedValue(new Error('db down'));
    const res = createRes();

    await deleteRoom(createReq({ params: { roomCode: 'ABC123' } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to delete room. Please try again.',
    });
  });
});
