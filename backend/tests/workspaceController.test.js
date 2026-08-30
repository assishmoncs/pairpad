const { getFiles, getFile, create, rename, remove } = require('../src/controllers/workspaceController');
const workspaceFileService = require('../src/services/workspaceFileService');
const roomAccess = require('../src/utils/roomAccess');
const roomPermissions = require('../src/utils/roomPermissions');
const apiResponse = require('../src/utils/apiResponse');

jest.mock('../src/services/workspaceFileService');
jest.mock('../src/utils/roomAccess');
jest.mock('../src/utils/roomPermissions');
jest.mock('../src/utils/apiResponse');

describe('workspaceController', () => {
  let req, res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { roomCode: 'ROOM12', fileId: 'file1' }, body: {}, user: { _id: 'user123' }, app: { get: jest.fn().mockReturnValue({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }) } };
    res = {};
    apiResponse.sendSuccess.mockImplementation(() => ({}));
    apiResponse.sendError.mockImplementation(() => ({}));
    roomAccess.findRoomByCode.mockResolvedValue({ _id: 'room1', roomCode: 'ROOM12' });
    roomAccess.isRoomParticipant.mockReturnValue(true);
    roomAccess.getRoomRole.mockReturnValue('owner');
    roomPermissions.canEdit.mockReturnValue(true);
  });

  it('gets files', async () => {
    workspaceFileService.listFiles.mockResolvedValue([]);
    await getFiles(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('gets file', async () => {
    workspaceFileService.findFile.mockResolvedValue({});
    await getFile(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('creates file', async () => {
    workspaceFileService.createFile.mockResolvedValue({ _id: 'file1' });
    await create(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('renames file', async () => {
    workspaceFileService.renameFile.mockResolvedValue({ _id: 'file1' });
    await rename(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('removes file', async () => {
    workspaceFileService.deleteFile.mockResolvedValue({ _id: 'file1' });
    await remove(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });
});
