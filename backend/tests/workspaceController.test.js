const { getFiles, create, rename, remove } = require('../src/controllers/workspaceController');
const workspaceFileService = require('../src/services/workspaceFileService');
const roomAccess = require('../src/utils/roomAccess');
const apiResponse = require('../src/utils/apiResponse');

jest.mock('../src/services/workspaceFileService');
jest.mock('../src/utils/roomAccess');
jest.mock('../src/utils/apiResponse');

describe('workspaceController', () => {
  let req, res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { roomCode: 'ROOM12' }, body: {}, user: { _id: 'user123' }, app: { get: jest.fn().mockReturnValue({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }) } };
    res = {};
    apiResponse.sendSuccess.mockImplementation(() => ({}));
    apiResponse.sendError.mockImplementation(() => ({}));
    roomAccess.normalizeRoomCode.mockReturnValue('ROOM12');
    roomAccess.findRoomByCode.mockResolvedValue({ _id: 'room1', roomCode: 'ROOM12' });
    roomAccess.isRoomParticipant.mockReturnValue(true);
    roomAccess.getRoomRole.mockReturnValue('owner');
  });

  it('gets files', async () => {
    workspaceFileService.listFiles.mockResolvedValue([]);
    await getFiles(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
    req.params.roomCode = null;
    await getFiles(req, res);
  });

  it('creates file', async () => {
    req.body = { name: 'f1', language: 'javascript' };
    workspaceFileService.createFile.mockResolvedValue({});
    await create(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
    req.body = {};
    await create(req, res);
  });

  it('updates file', async () => {
    req.params.fileId = '1';
    req.body = { content: 'test', name: 'f1' };
    workspaceFileService.renameFile.mockResolvedValue({});
    await rename(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
    req.params.fileId = null;
    await rename(req, res);
  });
  
  it('deletes file', async () => {
    req.params.fileId = '1';
    workspaceFileService.deleteFile.mockResolvedValue(true);
    await remove(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
    workspaceFileService.deleteFile.mockResolvedValue(false);
    await remove(req, res);
  });
});
