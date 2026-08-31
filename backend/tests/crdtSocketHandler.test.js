jest.mock('../src/models/Room');
jest.mock('../src/models/Revision');
jest.mock('../src/models/WorkspaceFile');
jest.mock('../src/utils/roomAccess');
jest.mock('../src/utils/roomPermissions');
jest.mock('../src/services/redisService');
jest.mock('../src/services/redisDocumentState');

const crdtSocketHandler = require('../src/sockets/crdtSocketHandler');
const roomAccess = require('../src/utils/roomAccess');
const roomPermissions = require('../src/utils/roomPermissions');
const WorkspaceFile = require('../src/models/WorkspaceFile');
const redisService = require('../src/services/redisService');
const redisDocState = require('../src/services/redisDocumentState');

describe('crdtSocketHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    roomAccess.normalizeRoomCode.mockImplementation((code) => (code ? String(code).trim().toUpperCase() : ''));
    roomAccess.getRoomRole.mockReturnValue('owner');
    roomPermissions.canEdit.mockReturnValue(true);
    roomPermissions.getMemberRole.mockReturnValue('owner');
    redisService.isRedisReady.mockReturnValue(false);
    redisDocState.getState.mockResolvedValue(null);
    redisDocState.setState.mockResolvedValue(true);
    redisDocState.applyOperationAtomic.mockResolvedValue(null);
  });

  it('exports functions', () => {
    expect(typeof crdtSocketHandler.initializeCrdtSocket).toBe('function');
    expect(typeof crdtSocketHandler.replaceDocumentState).toBe('function');
  });

  it('replaceDocumentState handles various inputs', () => {
    expect(crdtSocketHandler.replaceDocumentState('', 'content')).toBeNull();
    expect(crdtSocketHandler.replaceDocumentState('ROOM1', 123)).toBeNull();
    const valid = crdtSocketHandler.replaceDocumentState('ROOM1', 'hello', 'f1');
    expect(valid).toBeDefined();

    redisService.isRedisReady.mockReturnValue(true);
    crdtSocketHandler.replaceDocumentState('ROOM1', 'hello2');
  });

  it('handles crdt-sync-request with full coverage', async () => {
    const io = { on: jest.fn() };
    crdtSocketHandler.initializeCrdtSocket(io);
    const connectCb = io.on.mock.calls.find((c) => c[0] === 'connection')[1];

    const socket = {
      on: jest.fn(),
      currentRoom: 'ROOM1',
      user: { _id: 'u1' },
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    };
    connectCb(socket);

    const syncHandler = socket.on.mock.calls.find((c) => c[0] === 'crdt-sync-request')[1];

    roomAccess.findRoomByCode.mockResolvedValueOnce(null);
    const cb1 = jest.fn();
    await syncHandler({}, cb1);
    expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    const mockRoom = {
      _id: 'r1',
      roomCode: 'ROOM1',
      owner: 'u1',
      members: ['u1'],
      snapshotCode: 'hello',
    };
    roomAccess.findRoomByCode.mockResolvedValue(mockRoom);
    const cb2 = jest.fn();
    await syncHandler({}, cb2);
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    WorkspaceFile.findOne.mockResolvedValueOnce(null);
    const cb3 = jest.fn();
    await syncHandler({ fileId: 'f_missing' }, cb3);
    expect(cb3).toHaveBeenCalledWith(expect.objectContaining({ error: 'Workspace file not found.' }));

    WorkspaceFile.findOne.mockResolvedValue({ _id: 'f1', room: 'r1', snapshotCode: 'code', language: 'javascript' });
    const cb4 = jest.fn();
    await syncHandler({ fileId: 'f1' }, cb4);
    expect(cb4).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('handles crdt-operation with full coverage', async () => {
    const io = { on: jest.fn() };
    crdtSocketHandler.initializeCrdtSocket(io);
    const connectCb = io.on.mock.calls.find((c) => c[0] === 'connection')[1];

    const socket = {
      on: jest.fn(),
      currentRoom: 'ROOM1',
      user: { _id: 'u1' },
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    };
    connectCb(socket);

    const opHandler = socket.on.mock.calls.find((c) => c[0] === 'crdt-operation')[1];

    const mockRoom = {
      _id: 'r1',
      roomCode: 'ROOM1',
      owner: 'u1',
      members: ['u1'],
      snapshotCode: 'hello',
    };
    roomAccess.findRoomByCode.mockResolvedValue(mockRoom);

    roomPermissions.canEdit.mockReturnValueOnce(false);
    const cb1 = jest.fn();
    await opHandler({ type: 'replace' }, cb1);
    expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    const cb2 = jest.fn();
    await opHandler({ type: 'invalid' }, cb2);
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    const cb3 = jest.fn();
    await opHandler({ type: 'replace', inserts: [], deletes: [] }, cb3);
    expect(cb3).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    redisService.isRedisReady.mockReturnValue(true);
    redisDocState.applyOperationAtomic.mockResolvedValueOnce({
      state: 'nodes',
      changed: true,
      text: 'updated',
    });
    const cb4 = jest.fn();
    await opHandler({ type: 'replace', inserts: [], deletes: [], fileId: 'f1' }, cb4);
    expect(cb4).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    WorkspaceFile.findOne.mockResolvedValueOnce(null);
    const cb5 = jest.fn();
    await opHandler({ type: 'replace', fileId: 'missing' }, cb5);
    expect(cb5).toHaveBeenCalledWith(expect.objectContaining({ error: 'Workspace file not found.' }));

    const discHandler = socket.on.mock.calls.find((c) => c[0] === 'disconnect')[1];
    discHandler();
  });

  it('serializes concurrent Redis CRDT operations for the same document', async () => {
    const io = { on: jest.fn() };
    crdtSocketHandler.initializeCrdtSocket(io);
    const connectCb = io.on.mock.calls.find((c) => c[0] === 'connection')[1];
    const socket = {
      on: jest.fn(),
      currentRoom: 'ROOM2',
      user: { _id: 'u1' },
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    };
    connectCb(socket);

    const opHandler = socket.on.mock.calls.find((c) => c[0] === 'crdt-operation')[1];
    roomAccess.findRoomByCode.mockResolvedValue({
      _id: 'r2',
      roomCode: 'ROOM2',
      owner: 'u1',
      members: ['u1'],
      snapshotCode: '',
    });
    redisService.isRedisReady.mockReturnValue(true);

    const order = [];
    let running = 0;
    let maxRunning = 0;
    redisDocState.applyOperationAtomic.mockImplementation(async (key, operation) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      order.push(operation.opId);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running -= 1;
      return { state: '{"version":1,"nodes":[]}', changed: true, text: '' };
    });

    const firstCb = jest.fn();
    const secondCb = jest.fn();
    const first = opHandler({ type: 'replace', opId: 'first', insert: [], deleteIds: [], fileId: 'f1' }, firstCb);
    const second = opHandler({ type: 'replace', opId: 'second', insert: [], deleteIds: [], fileId: 'f1' }, secondCb);
    await Promise.all([first, second]);

    expect(maxRunning).toBe(1);
    expect(order).toEqual(['first', 'second']);
    expect(firstCb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(secondCb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
