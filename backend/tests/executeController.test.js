jest.mock('../src/models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../src/services/judge0Service', () => ({
  submitCode: jest.fn(),
  LANGUAGE_MAP: { javascript: 63, python: 71 },
}));

const Room = require('../src/models/Room');
const judge0Service = require('../src/services/judge0Service');
const { executeCode } = require('../src/controllers/executeController');

const USER_ID = 'user-1';

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createReq = (body = {}, overrides = {}) => ({
  body: {
    source_code: 'print(1)',
    language: 'python',
    roomCode: 'abc123',
    ...body,
  },
  user: { _id: { toString: () => USER_ID }, name: 'Ada' },
  app: { get: jest.fn().mockReturnValue(undefined) },
  ...overrides,
});

const memberRoom = () => ({
  members: [{ toString: () => USER_ID }],
  owner: { toString: () => 'someone-else' },
});

let consoleError;

beforeEach(() => {
  jest.clearAllMocks();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('executeCode validation', () => {
  it.each([
    [{ source_code: undefined }, 'Source code is required and must be a string.'],
    [{ source_code: 123 }, 'Source code is required and must be a string.'],
    [{ language: undefined }, 'Language is required.'],
    [{ language: 42 }, 'Language is required.'],
    [
      { roomCode: undefined },
      'roomCode is required to execute code in a room context.',
    ],
    [{ stdin: 5 }, 'Stdin must be a string.'],
  ])('rejects an invalid body with 400', async (body, message) => {
    const res = createRes();

    await executeCode(createReq(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message });
    expect(judge0Service.submitCode).not.toHaveBeenCalled();
  });

  it('rejects an unsupported language listing the supported ones', async () => {
    const res = createRes();

    await executeCode(createReq({ language: 'cobol' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Unsupported language. Supported: javascript, python',
    });
  });
});

describe('executeCode authorization', () => {
  it('returns 404 when the room does not exist', async () => {
    Room.findOne.mockResolvedValue(null);
    const res = createRes();

    await executeCode(createReq(), res);

    expect(Room.findOne).toHaveBeenCalledWith({ roomCode: 'ABC123' });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Room not found.' });
  });

  it('returns 403 when the user is neither a member nor the owner', async () => {
    Room.findOne.mockResolvedValue({
      members: [{ toString: () => 'other' }],
      owner: { toString: () => 'other' },
    });
    const res = createRes();

    await executeCode(createReq(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'You must be a member of the room to execute code.',
    });
  });

  it('allows the owner even when not listed as a member', async () => {
    Room.findOne.mockResolvedValue({
      members: [],
      owner: { toString: () => USER_ID },
    });
    judge0Service.submitCode.mockResolvedValue({ status: 'success' });
    const res = createRes();

    await executeCode(createReq(), res);

    expect(judge0Service.submitCode).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Code executed successfully.',
      data: { result: { status: 'success' } },
    });
  });
});

describe('executeCode success path', () => {
  it('runs the code and broadcasts the result to the room', async () => {
    Room.findOne.mockResolvedValue(memberRoom());
    const result = { status: 'success', stdout: '1\n' };
    judge0Service.submitCode.mockResolvedValue(result);
    const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    const res = createRes();

    await executeCode(createReq({ stdin: '5' }, { io }), res);

    expect(judge0Service.submitCode).toHaveBeenCalledWith('print(1)', 'python', '5');
    expect(io.to).toHaveBeenCalledWith('room:ABC123');
    expect(io.emit).toHaveBeenCalledWith(
      'code-execution-result',
      expect.objectContaining({ result, language: 'python', executedByName: 'Ada' })
    );
    expect(res.json).toHaveBeenCalledWith({
      message: 'Code executed successfully.',
      data: { result },
    });
  });

  it('falls back to the io instance stored on the app', async () => {
    Room.findOne.mockResolvedValue(memberRoom());
    judge0Service.submitCode.mockResolvedValue({ status: 'success' });
    const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    const req = createReq({}, { app: { get: jest.fn().mockReturnValue(io) } });
    const res = createRes();

    await executeCode(req, res);

    expect(req.app.get).toHaveBeenCalledWith('io');
    expect(io.emit).toHaveBeenCalled();
  });

  it('still responds when no io instance is available', async () => {
    Room.findOne.mockResolvedValue(memberRoom());
    judge0Service.submitCode.mockResolvedValue({ status: 'success' });
    const req = createReq({}, { app: { get: jest.fn().mockReturnValue(undefined) } });
    const res = createRes();

    await executeCode(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Code executed successfully.' })
    );
  });
});

describe('executeCode error mapping', () => {
  beforeEach(() => {
    Room.findOne.mockResolvedValue(memberRoom());
  });

  it.each([
    ['Judge0 API key not configured.', 503, 'Code execution service not configured. Please contact the administrator.'],
    ['Rate limit exceeded.', 429, 'Rate limit exceeded. Please try again in a few moments.'],
    ['Execution timed out.', 408, 'Code execution timed out. The code may be taking too long to run.'],
  ])('maps "%s" to %i', async (thrown, status, message) => {
    judge0Service.submitCode.mockRejectedValue(new Error(thrown));
    const req = createReq({}, { io: null, app: { get: () => null } });
    const res = createRes();

    await executeCode(req, res);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ message });
  });

  it('returns 500 for unexpected execution failures without leaking the cause', async () => {
    judge0Service.submitCode.mockRejectedValue(new Error('boom'));
    const req = createReq({}, { io: null, app: { get: () => null } });
    const res = createRes();

    await executeCode(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to execute code. Please try again.',
    });
  });
});
