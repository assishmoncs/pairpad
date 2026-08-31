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

    const invokeOperation = (operation, callback) =>
      new Promise((resolve, reject) => {
        try {
          opHandler(operation, (result) => {
            callback(result);
            resolve(result);
          });
        } catch (error) {
          reject(error);
        }
      });

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
    await invokeOperation({ type: 'replace' }, cb1);
    expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    const cb2 = jest.fn();
    await invokeOperation({ type: 'invalid' }, cb2);
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));

    const cb3 = jest.fn();
    await invokeOperation({ type: 'replace', inserts: [], deletes: [] }, cb3);
    expect(cb3).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    redisService.isRedisReady.mockReturnValue(true);
    redisDocState.applyOperationAtomic.mockResolvedValueOnce({
      state: 'nodes',
      changed: true,
      text: 'updated',
    });
    const cb4 = jest.fn();
    await invokeOperation({ type: 'replace', inserts: [], deletes: [], fileId: 'f1' }, cb4);
    expect(cb4).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    WorkspaceFile.findOne.mockResolvedValueOnce(null);
    const cb5 = jest.fn();
    await invokeOperation({ type: 'replace', fileId: 'missing' }, cb5);
    expect(cb5).toHaveBeenCalledWith(expect.objectContaining({ error: 'Workspace file not found.' }));

    const discHandler = socket.on.mock.calls.find((c) => c[0] === 'disconnect')[1];
    discHandler();
  });
});
