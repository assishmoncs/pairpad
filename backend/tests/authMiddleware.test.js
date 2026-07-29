jest.mock('../src/models/User', () => ({ findById: jest.fn() }));

const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const authMiddleware = require('../src/middleware/auth');

const JWT_SECRET = 'test_jwt_secret_for_testing_only';

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockUserLookup = (user) => {
  User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
};

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authMiddleware', () => {
  it('attaches the user and calls next for a valid token', async () => {
    const user = { _id: 'user-1', name: 'Ada' };
    mockUserLookup(user);
    const token = jwt.sign({ userId: 'user-1' }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(User.findById).toHaveBeenCalledWith('user-1');
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a request without an Authorization header', async () => {
    const res = createRes();
    const next = jest.fn();

    await authMiddleware({ headers: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Authorization required. Please provide a valid token.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a header that is not a Bearer token', async () => {
    const res = createRes();

    await authMiddleware({ headers: { authorization: 'Basic abc' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a malformed token', async () => {
    const res = createRes();

    await authMiddleware(
      { headers: { authorization: 'Bearer not-a-jwt' } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token format.' });
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ userId: 'user-1' }, JWT_SECRET, { expiresIn: '-1s' });
    const res = createRes();

    await authMiddleware(
      { headers: { authorization: `Bearer ${token}` } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Token has expired. Please login again.',
    });
  });

  it('rejects a valid token whose user no longer exists', async () => {
    mockUserLookup(null);
    const token = jwt.sign({ userId: 'ghost' }, JWT_SECRET);
    const res = createRes();

    await authMiddleware(
      { headers: { authorization: `Bearer ${token}` } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'User not found. Token may be invalid.',
    });
  });

  it('returns 500 when the user lookup fails unexpectedly', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockRejectedValue(new Error('db down')),
    });
    const token = jwt.sign({ userId: 'user-1' }, JWT_SECRET);
    const res = createRes();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await authMiddleware(
      { headers: { authorization: `Bearer ${token}` } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Authentication failed. Please try again.',
    });
    consoleError.mockRestore();
  });
});
