const interviewController = require('../src/controllers/interviewController');
const { getInterview, configureInterview, startInterview, pauseInterview, resumeInterview, endInterview, submit } = interviewController;
const interviewService = require('../src/services/interviewService');
const roomAccess = require('../src/utils/roomAccess');
const apiResponse = require('../src/utils/apiResponse');

jest.mock('../src/services/interviewService');
jest.mock('../src/utils/roomAccess');
jest.mock('../src/utils/apiResponse');

describe('interviewController', () => {
  let req, res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { roomCode: 'ROOM12' }, body: {}, user: { _id: 'user123' }, app: { get: jest.fn().mockReturnValue({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }) } };
    res = {};
    apiResponse.sendSuccess.mockImplementation(() => ({}));
    apiResponse.sendError.mockImplementation(() => ({}));
    roomAccess.normalizeRoomCode.mockReturnValue('ROOM12');
    roomAccess.findRoomByCode.mockResolvedValue({ roomCode: 'ROOM12', interview: {} });
    roomAccess.isRoomParticipant.mockReturnValue(true);
    roomAccess.getRoomRole.mockReturnValue('owner');
    interviewService.sanitizeHostInterview.mockReturnValue({});
    interviewService.sanitizePublicInterview.mockReturnValue({});
  });

  it('gets interview', async () => {
    await getInterview(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('configures interview', async () => {
    interviewService.createOrUpdateInterview.mockResolvedValue({});
    await configureInterview(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });

  it('starts interview', async () => {
    interviewService.startInterview.mockResolvedValue({});
    await startInterview(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });
  
  it('submits interview', async () => {
    req.body = { sourceCode: 'code', language: 'javascript' };
    interviewService.submitCandidate.mockResolvedValue({ publicResults: [], hiddenResults: [], hiddenPassed: true, score: 100, total: 100 });
    await submit(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });
});
