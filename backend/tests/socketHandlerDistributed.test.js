jest.mock('../src/models/Message');
jest.mock('../src/models/Room');
jest.mock('../src/utils/tokenAuth');
jest.mock('../src/utils/roomAccess');
jest.mock('../src/utils/roomPermissions');
jest.mock('../src/services/redisPresenceServiceV2');
jest.mock('../src/services/interviewService');

const socketHandlerDistributed = require('../src/sockets/socketHandlerDistributed');
const tokenAuth = require('../src/utils/tokenAuth');
const roomAccess = require('../src/utils/roomAccess');
const roomPermissions = require('../src/utils/roomPermissions');
const Message = require('../src/models/Message');
const Room = require('../src/models/Room');
const redisPresence = require('../src/services/redisPresenceServiceV2');

describe('socketHandlerDistributed', () => {
  let io, socket, handlers, authMiddleware, connHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};
    socket = {
      id: 'soc1',
      handshake: { auth: { token: 'valid-token' }, query: {}, address: '127.0.0.1' },
      user: { _id: 'user1', name: 'User 1' },
      on: jest.fn((event, cb) => { handlers[event] = cb; }),
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      disconnect: jest.fn(),
      currentRoom: null,
    };

    io = {
      use: jest.fn((cb) => { authMiddleware = cb; }),
      on: jest.fn((event, cb) => {
        if (event === 'connection') connHandler = cb;
      }),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    redisPresence.list.mockResolvedValue([]);
    redisPresence.upsert.mockResolvedValue(true);
    redisPresence.remove.mockResolvedValue(true);
    redisPresence.refresh.mockResolvedValue(true);

    Room.updateOne.mockReturnValue({ catch: jest.fn() });

    roomAccess.normalizeRoomCode.mockImplementation((c) => (c ? String(c).trim().toUpperCase() : ''));
    roomAccess.findRoomByCode.mockResolvedValue({
      _id: 'r1',
      name: 'Room 1',
      roomCode: 'ROOM1',
      language: 'javascript',
      interview: { status: 'active' },
    });
    roomAccess.isRoomParticipant.mockReturnValue(true);
    roomAccess.getRoomRole.mockReturnValue('owner');
    roomPermissions.canEdit.mockReturnValue(true);

    tokenAuth.getUserFromToken.mockResolvedValue({ _id: 'user1', name: 'User 1' });
  });

  it('runs auth middleware properly', async () => {
    socketHandlerDistributed(io);
    const next1 = jest.fn();
    await authMiddleware(socket, next1);
    expect(next1).toHaveBeenCalledWith();

    // Missing token
    const unauthSocket = { handshake: {} };
    const next2 = jest.fn();
    await authMiddleware(unauthSocket, next2);
    expect(next2).toHaveBeenCalledWith(expect.any(Error));

    // Invalid token
    tokenAuth.getUserFromToken.mockResolvedValueOnce(null);
    const next3 = jest.fn();
    await authMiddleware(socket, next3);
    expect(next3).toHaveBeenCalledWith(expect.any(Error));
  });

  it('handles join-room and leave-room', async () => {
    socketHandlerDistributed(io);
    connHandler(socket);

    const joinRoom = handlers['join-room'];
    const cb1 = jest.fn();
    await joinRoom({ roomCode: '' }, cb1);
    expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    // room not found
    roomAccess.findRoomByCode.mockResolvedValueOnce(null);
    const cb2 = jest.fn();
    await joinRoom({ roomCode: 'ROOM1' }, cb2);
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ error: 'Room not found.' }));

    // not participant
    roomAccess.isRoomParticipant.mockReturnValueOnce(false);
    const cb3 = jest.fn();
    await joinRoom({ roomCode: 'ROOM1' }, cb3);
    expect(cb3).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    // successful join
    const cb4 = jest.fn();
    await joinRoom({ roomCode: 'ROOM1' }, cb4);
    expect(socket.join).toHaveBeenCalledWith('room:ROOM1');
    expect(cb4).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    // leave room
    socket.currentRoom = 'ROOM1';
    const leaveRoom = handlers['leave-room'];
    leaveRoom();
    await new Promise((r) => setTimeout(r, 20));
    expect(socket.leave).toHaveBeenCalled();
  });

  it('handles code-change', async () => {
    socketHandlerDistributed(io);
    connHandler(socket);

    const codeChange = handlers['code-change'];
    const cb1 = jest.fn();
    await codeChange({}, cb1);
    expect(cb1).toHaveBeenCalledWith({ error: 'Not in a room.' });

    socket.currentRoom = 'ROOM1';

    // unauthorized editor
    roomPermissions.canEdit.mockReturnValueOnce(false);
    const cb2 = jest.fn();
    await codeChange({ content: 'code' }, cb2);
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    // missing content
    const cb3 = jest.fn();
    await codeChange({}, cb3);
    expect(cb3).toHaveBeenCalledWith(expect.objectContaining({ error: 'Content is required.' }));

    // valid code change
    const cb4 = jest.fn();
    await codeChange({ content: 'console.log(1)', language: 'javascript' }, cb4);
    expect(cb4).toHaveBeenCalledWith({ success: true });
  });

  it('handles cursor-update and chat-message', async () => {
    socketHandlerDistributed(io);
    connHandler(socket);

    const cursorUpdate = handlers['cursor-update'];
    await cursorUpdate({});
    socket.currentRoom = 'ROOM1';
    await cursorUpdate({ position: { line: 1, column: 1 } });
    await cursorUpdate({ position: { line: -1, column: 0 } });

    const chatMsg = handlers['chat-message'];
    const cb1 = jest.fn();
    socket.currentRoom = null;
    await chatMsg({}, cb1);
    expect(cb1).toHaveBeenCalledWith({ error: 'Not in a room.' });

    socket.currentRoom = 'ROOM1';
    const cb2 = jest.fn();
    await chatMsg({}, cb2);
    expect(cb2).toHaveBeenCalledWith({ error: 'Message content is required.' });

    Message.create.mockResolvedValue({ _id: 'm1' });
    Message.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: 'm1',
        content: 'hello',
        sender: { _id: 'u1', name: 'User 1' },
        createdAt: new Date(),
      }),
    });

    const cb3 = jest.fn();
    await chatMsg({ content: 'hello' }, cb3);
    expect(cb3).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    // interview-state-request
    const interviewReq = handlers['interview-state-request'];
    const cb4 = jest.fn();
    await interviewReq({}, cb4);
    expect(cb4).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    // disconnect
    const disconnect = handlers['disconnect'];
    disconnect();
  });
});
