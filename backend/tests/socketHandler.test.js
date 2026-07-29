jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/Message', () => ({ create: jest.fn(), findById: jest.fn() }));

const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const Room = require('../src/models/Room');
const Message = require('../src/models/Message');
const initializeSocket = require('../src/sockets/socketHandler');

const JWT_SECRET = 'test_jwt_secret_for_testing_only';
const USER_ID = 'user-1';
const OTHER_ID = 'user-2';
const ROOM_CODE = 'ABC123';

// Minimal Socket.IO test doubles: capture registered handlers and emitted events.
const createIo = () => {
  const io = {
    middleware: null,
    connectionHandler: null,
    emitted: [],
    use: (fn) => {
      io.middleware = fn;
    },
    on: (event, fn) => {
      if (event === 'connection') io.connectionHandler = fn;
    },
    to: (channel) => ({
      emit: (event, payload) => io.emitted.push({ channel, event, payload }),
    }),
  };
  return io;
};

const createSocket = (user = { _id: USER_ID, name: 'Ada' }) => {
  const socket = {
    id: 'socket-1',
    user,
    handlers: {},
    joined: [],
    left: [],
    emittedToOthers: [],
    on: (event, fn) => {
      socket.handlers[event] = fn;
    },
    join: (channel) => socket.joined.push(channel),
    leave: (channel) => socket.left.push(channel),
    to: (channel) => ({
      emit: (event, payload) =>
        socket.emittedToOthers.push({ channel, event, payload }),
    }),
  };
  return socket;
};

const connect = (io, socket) => {
  io.connectionHandler(socket);
  return socket;
};

const membershipRoom = (overrides = {}) => ({
  _id: 'room-1',
  name: 'Test Room',
  language: 'javascript',
  members: [{ _id: { toString: () => USER_ID } }],
  owner: { _id: { toString: () => USER_ID } },
  ...overrides,
});

let io;
let consoleLog;
let consoleError;

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  io = createIo();
  initializeSocket(io);
});

afterEach(() => {
  consoleLog.mockRestore();
  consoleError.mockRestore();
});

const joinRoom = async (socket, room = membershipRoom()) => {
  Room.findOne.mockResolvedValue(room);
  const callback = jest.fn();
  await socket.handlers['join-room']({ roomCode: ROOM_CODE }, callback);
  return callback;
};

describe('connection authentication', () => {
  const runMiddleware = async (handshake) => {
    const socket = { handshake };
    const next = jest.fn();
    await io.middleware(socket, next);
    return { socket, next };
  };

  it('rejects a handshake with no token', async () => {
    const { next } = await runMiddleware({ auth: {}, query: {} });

    expect(next.mock.calls[0][0].message).toMatch(/Authentication required/);
  });

  it('rejects an invalid token', async () => {
    const { next } = await runMiddleware({ auth: { token: 'garbage' }, query: {} });

    expect(next.mock.calls[0][0].message).toBe('Invalid or expired token.');
  });

  it('rejects a valid token whose user no longer exists', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const token = jwt.sign({ userId: USER_ID }, JWT_SECRET);

    const { next } = await runMiddleware({ auth: { token }, query: {} });

    expect(next.mock.calls[0][0].message).toBe('Invalid or expired token.');
  });

  it('attaches the authenticated user from a query-string token', async () => {
    const user = { _id: USER_ID, name: 'Ada' };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const token = jwt.sign({ userId: USER_ID }, JWT_SECRET);

    const { socket, next } = await runMiddleware({ auth: {}, query: { token } });

    expect(socket.user).toBe(user);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('join-room', () => {
  it('requires a room code', async () => {
    const socket = connect(io, createSocket());
    const callback = jest.fn();

    await socket.handlers['join-room']({}, callback);

    expect(callback).toHaveBeenCalledWith({ error: 'Room code is required.' });
  });

  it('reports an unknown room', async () => {
    const socket = connect(io, createSocket());
    Room.findOne.mockResolvedValue(null);
    const callback = jest.fn();

    await socket.handlers['join-room']({ roomCode: ROOM_CODE }, callback);

    expect(callback).toHaveBeenCalledWith({ error: 'Room not found.' });
  });

  it('rejects a user who is neither member nor owner', async () => {
    const socket = connect(io, createSocket());
    const callback = await joinRoom(
      socket,
      membershipRoom({
        members: [{ _id: { toString: () => OTHER_ID } }],
        owner: { _id: { toString: () => OTHER_ID } },
      })
    );

    expect(callback).toHaveBeenCalledWith({
      error: 'You are not authorized to join this room.',
    });
    expect(socket.joined).toHaveLength(0);
  });

  it('joins the room channel, records presence and notifies others', async () => {
    const socket = connect(io, createSocket());

    const callback = await joinRoom(socket);

    expect(Room.findOne).toHaveBeenCalledWith({ roomCode: ROOM_CODE });
    expect(socket.joined).toEqual([`room:${ROOM_CODE}`]);
    expect(socket.currentRoom).toBe(ROOM_CODE);
    expect(socket.emittedToOthers).toContainEqual({
      channel: `room:${ROOM_CODE}`,
      event: 'user-joined',
      payload: { userId: USER_ID, name: 'Ada' },
    });
    expect(io.emitted).toContainEqual({
      channel: `room:${ROOM_CODE}`,
      event: 'presence-update',
      payload: { users: [{ userId: USER_ID, name: 'Ada', socketId: 'socket-1' }] },
    });
    expect(callback).toHaveBeenCalledWith({
      success: true,
      room: { roomCode: ROOM_CODE, name: 'Test Room', language: 'javascript' },
      users: [{ userId: USER_ID, name: 'Ada' }],
    });
  });

  it('normalizes a lowercase room code', async () => {
    const socket = connect(io, createSocket());
    Room.findOne.mockResolvedValue(membershipRoom());

    await socket.handlers['join-room']({ roomCode: ' abc123 ' }, jest.fn());

    expect(Room.findOne).toHaveBeenCalledWith({ roomCode: ROOM_CODE });
  });

  it('reports a failure when the lookup throws', async () => {
    const socket = connect(io, createSocket());
    Room.findOne.mockRejectedValue(new Error('db down'));
    const callback = jest.fn();

    await socket.handlers['join-room']({ roomCode: ROOM_CODE }, callback);

    expect(callback).toHaveBeenCalledWith({ error: 'Failed to join room.' });
  });
});

describe('code-change', () => {
  it('rejects a broadcast from a socket that has not joined a room', () => {
    const socket = connect(io, createSocket());
    const callback = jest.fn();

    socket.handlers['code-change']({ content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith({ error: 'Not in a room.' });
  });

  it('requires content', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    const callback = jest.fn();

    socket.handlers['code-change']({}, callback);

    expect(callback).toHaveBeenCalledWith({ error: 'Content is required.' });
  });

  it('broadcasts the new content to everyone else in the room', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    const callback = jest.fn();

    socket.handlers['code-change']({ content: 'let x = 1;', language: 'javascript' }, callback);

    expect(socket.emittedToOthers).toContainEqual({
      channel: `room:${ROOM_CODE}`,
      event: 'code-change',
      payload: {
        content: 'let x = 1;',
        language: 'javascript',
        userId: USER_ID,
        userName: 'Ada',
      },
    });
    expect(callback).toHaveBeenCalledWith({ success: true });
  });
});

describe('cursor-update', () => {
  it('ignores updates from a socket outside a room', () => {
    const socket = connect(io, createSocket());

    socket.handlers['cursor-update']({ position: { line: 1, column: 1 } });

    expect(socket.emittedToOthers).toHaveLength(0);
  });

  it('relays the cursor position to the room', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    const position = { line: 3, column: 7 };

    socket.handlers['cursor-update']({ position, selection: null });

    expect(socket.emittedToOthers).toContainEqual({
      channel: `room:${ROOM_CODE}`,
      event: 'cursor-update',
      payload: { userId: USER_ID, userName: 'Ada', position, selection: null },
    });
  });
});

describe('chat-message', () => {
  it('rejects a message from a socket outside a room', async () => {
    const socket = connect(io, createSocket());
    const callback = jest.fn();

    await socket.handlers['chat-message']({ content: 'hi' }, callback);

    expect(callback).toHaveBeenCalledWith({ error: 'Not in a room.' });
  });

  it('rejects blank content', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    const callback = jest.fn();

    await socket.handlers['chat-message']({ content: '   ' }, callback);

    expect(callback).toHaveBeenCalledWith({
      error: 'Message content is required.',
    });
  });

  it('reports a room that disappeared', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    Room.findOne.mockResolvedValue(null);
    const callback = jest.fn();

    await socket.handlers['chat-message']({ content: 'hi' }, callback);

    expect(callback).toHaveBeenCalledWith({ error: 'Room not found.' });
    expect(Message.create).not.toHaveBeenCalled();
  });

  it('persists the trimmed message and broadcasts it to the room', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    Message.create.mockResolvedValue({ _id: 'msg-1' });
    const populatedMessage = {
      _id: 'msg-1',
      content: 'hello',
      sender: { _id: USER_ID, name: 'Ada', email: 'ada@example.com' },
      createdAt: 'now',
    };
    Message.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(populatedMessage),
    });
    const callback = jest.fn();

    await socket.handlers['chat-message']({ content: '  hello  ' }, callback);

    expect(Message.create).toHaveBeenCalledWith({
      room: 'room-1',
      sender: USER_ID,
      content: 'hello',
    });
    expect(io.emitted).toContainEqual({
      channel: `room:${ROOM_CODE}`,
      event: 'chat-message',
      payload: {
        _id: 'msg-1',
        content: 'hello',
        sender: { _id: USER_ID, name: 'Ada', email: 'ada@example.com' },
        createdAt: 'now',
      },
    });
    expect(callback).toHaveBeenCalledWith({
      success: true,
      message: populatedMessage,
    });
  });

  it('truncates messages longer than 1000 characters', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    Message.create.mockResolvedValue({ _id: 'msg-1' });
    Message.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: 'msg-1',
        content: 'x',
        sender: { _id: USER_ID, name: 'Ada', email: 'a@b.c' },
      }),
    });

    await socket.handlers['chat-message']({ content: 'x'.repeat(1500) }, jest.fn());

    expect(Message.create.mock.calls[0][0].content).toHaveLength(1000);
  });

  it('reports a persistence failure', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    Message.create.mockRejectedValue(new Error('db down'));
    const callback = jest.fn();

    await socket.handlers['chat-message']({ content: 'hi' }, callback);

    expect(callback).toHaveBeenCalledWith({ error: 'Failed to send message.' });
  });
});

describe('leaving a room', () => {
  it('clears presence and notifies the room on leave-room', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    socket.emittedToOthers = [];
    io.emitted = [];

    socket.handlers['leave-room']();

    expect(socket.left).toEqual([`room:${ROOM_CODE}`]);
    expect(socket.emittedToOthers).toContainEqual({
      channel: `room:${ROOM_CODE}`,
      event: 'user-left',
      payload: { userId: USER_ID, name: 'Ada' },
    });
    expect(io.emitted).toContainEqual({
      channel: `room:${ROOM_CODE}`,
      event: 'presence-update',
      payload: { users: [] },
    });
    expect(socket.currentRoom).toBeNull();
  });

  it('ignores leave-room when the socket never joined', () => {
    const socket = connect(io, createSocket());

    socket.handlers['leave-room']();

    expect(socket.left).toHaveLength(0);
  });

  it('removes presence on disconnect', async () => {
    const socket = connect(io, createSocket());
    await joinRoom(socket);
    io.emitted = [];

    socket.handlers.disconnect();

    expect(socket.currentRoom).toBeNull();
    expect(io.emitted).toContainEqual({
      channel: `room:${ROOM_CODE}`,
      event: 'presence-update',
      payload: { users: [] },
    });
  });

  it('keeps the remaining user in presence when one of two disconnects', async () => {
    const first = connect(io, createSocket());
    await joinRoom(first);
    const second = connect(io, createSocket({ _id: OTHER_ID, name: 'Grace' }));
    second.id = 'socket-2';
    await joinRoom(
      second,
      membershipRoom({ members: [{ _id: { toString: () => OTHER_ID } }] })
    );
    io.emitted = [];

    first.handlers.disconnect();

    const presenceUpdate = io.emitted.find((e) => e.event === 'presence-update');
    expect(presenceUpdate.payload.users).toEqual([
      { userId: OTHER_ID, name: 'Grace', socketId: 'socket-2' },
    ]);
  });
});
