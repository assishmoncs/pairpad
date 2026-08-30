const { register, login, getMe, refreshAccessToken, logout, logoutAll, getRefreshCookieName } = require('../src/controllers/authSessionController');
const User = require('../src/models/User');
const sessionTokens = require('../src/utils/sessionTokens');
const refreshSessionService = require('../src/services/refreshSessionService');
const apiResponse = require('../src/utils/apiResponse');

jest.mock('../src/models/User');
jest.mock('../src/utils/sessionTokens');
jest.mock('../src/services/refreshSessionService');
jest.mock('../src/utils/apiResponse');

describe('authSessionController', () => {
  let req, res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {}, headers: {}, user: { _id: 'user123', toJSON: () => ({ id: 'user123' }) } };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
    apiResponse.sendSuccess.mockImplementation((r, m, d, s) => ({ success: true }));
    apiResponse.sendError.mockImplementation((r, s, m) => ({ error: true }));
    apiResponse.sendValidationError.mockImplementation(() => ({ error: true }));
    sessionTokens.generateAccessToken.mockReturnValue('access123');
    refreshSessionService.issueSession.mockResolvedValue({ refreshToken: 'refresh123' });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'user123', toJSON: () => ({}), comparePassword: jest.fn().mockResolvedValue(true) }) });
    User.create.mockResolvedValue({ _id: 'user123', toJSON: () => ({}) });
  });

  it('registers a user', async () => {
    req.body = { name: 'Test', email: 'test@example.com', password: 'Password123!' };
    User.findOne.mockResolvedValue(null);
    await register(req, res);
    expect(User.create).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(getRefreshCookieName(), 'refresh123', expect.any(Object));
  });

  it('logs in a user', async () => {
    req.body = { email: 'test@example.com', password: 'Password123!' };
    await login(req, res);
    expect(res.cookie).toHaveBeenCalledWith(getRefreshCookieName(), 'refresh123', expect.any(Object));
  });

  it('refreshes token', async () => {
    req.headers.cookie = getRefreshCookieName() + '=refresh123';
    refreshSessionService.rotate.mockResolvedValue({ userId: 'user123', refreshToken: 'newRefresh' });
    await refreshAccessToken(req, res);
    expect(res.cookie).toHaveBeenCalledWith(getRefreshCookieName(), 'newRefresh', expect.any(Object));
  });

  it('logs out', async () => {
    req.headers.cookie = getRefreshCookieName() + '=refresh123';
    await logout(req, res);
    expect(refreshSessionService.revokeToken).toHaveBeenCalledWith('refresh123');
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('logs out all', async () => {
    await logoutAll(req, res);
    expect(refreshSessionService.revokeAllForUser).toHaveBeenCalledWith('user123');
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('gets me', async () => {
    await getMe(req, res);
    expect(apiResponse.sendSuccess).toHaveBeenCalled();
  });
});
