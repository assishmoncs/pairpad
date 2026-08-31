const { getRevisions, getRevisionDiff, createManualRevision, restoreRevision } = require('../src/controllers/revisionController');
const revisionService = require('../src/services/revisionService');
const roomAccess = require('../src/utils/roomAccess');
const roomPermissions = require('../src/utils/roomPermissions');
const apiResponse = require('../src/utils/apiResponse');
const crdtSocketHandler = require('../src/sockets/crdtSocketHandler');


jest.mock('../src/services/revisionService');
jest.mock('../src/utils/roomAccess');
jest.mock('../src/utils/roomPermissions');
jest.mock('../src/utils/apiResponse');
jest.mock('../src/sockets/crdtSocketHandler');
jest.mock('../src/models/Revision', () => ({
  findOne: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue({ _id: 'rev1', content: '', language: 'js', createdAt: new Date() }),
  findById: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  schema: { path: () => ({ enumValues: ['javascript'] }) }
}));

describe('revisionController', () => {
  let req, res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { roomCode: 'ROOM12', revisionId: 'rev1' }, query: {}, body: {}, user: { _id: 'user123' }, app: { get: jest.fn().mockReturnValue({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }) } };
    res = {};
    apiResponse.sendSuccess.mockImplementation(() => ({}));
    apiResponse.sendError.mockImplementation(() => ({}));
    roomAccess.findRoomByCode.mockResolvedValue({ _id: 'room1', roomCode: 'ROOM12', language: 'javascript' });
    roomAccess.isRoomParticipant.mockReturnValue(true);
    roomPermissions.getMemberRole.mockReturnValue('owner');
  });

  it('gets revisions', async () => {
    revisionService.listRevisions.mockResolvedValue([]);
    await getRevisions(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('gets revision diff', async () => {
    req.query = { from: '123456789012345678901234', to: '123456789012345678901235' };
    await getRevisionDiff(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('creates manual revision', async () => {
    req.body = { content: 'test', language: 'javascript' };
    revisionService.createRevision.mockResolvedValue({ _id: 'rev1' });
    await createManualRevision(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('restores revision', async () => {
    req.params.revisionId = '123456789012345678901234';
    revisionService.findRevision.mockResolvedValue({ _id: 'rev1', content: 'test', language: 'javascript' });
    crdtSocketHandler.replaceDocumentState.mockReturnValue({});
    revisionService.createRevision.mockResolvedValue({ _id: 'rev2' });
    await restoreRevision(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });
});
