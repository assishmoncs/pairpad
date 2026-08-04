jest.mock('../src/models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../src/utils/generateToken', () => ({
  generateToken: jest.fn(() => 'signed-token'),
  generateAccessToken: jest.fn(() => 'signed-token'),
  generateRefreshToken: jest.fn(() => 'signed-refresh-token'),
}));

const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/generateToken');
const { register, login, getMe } = require('../src/controllers/authController');

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const userDoc = (overrides = {}) => ({
  _id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  ...overrides,
});

let consoleError;

beforeEach(() => {
  jest.clearAllMocks();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('register', () => {
  const body = { name: 'Ada', email: 'ada@example.com', password: 'password123' };

  it.each([
    [{ name: undefined }],
    [{ email: undefined }],
    [{ password: undefined }],
  ])('rejects a request with a missing field', async (missing) => {
    const res = createRes();

    await register({ body: { ...body, ...missing } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Please provide all required fields: name, email, and password.',
    });
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects an email that is already registered', async () => {
    User.findOne.mockResolvedValue(userDoc());
    const res = createRes();

    await register({ body }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'An account with this email already exists.',
    });
    expect(User.create).not.toHaveBeenCalled();
  });

  it('creates the user and returns a token without the password', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(userDoc({ password: 'hashed' }));
    const res = createRes();

    await register({ body }, res);

    expect(User.create).toHaveBeenCalledWith(body);
    expect(generateAccessToken).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Registration successful.',
      data: {
        user: { _id: 'user-1', id: 'user-1', name: 'Ada', email: 'ada@example.com' },
        token: 'signed-token',
        refreshToken: 'signed-refresh-token',
      },
    });
  });

  it('surfaces Mongoose validation errors as 400', async () => {
    User.findOne.mockResolvedValue(null);
    const error = new Error('invalid');
    error.name = 'ValidationError';
    error.errors = { email: { message: 'Please enter a valid email address' } };
    User.create.mockRejectedValue(error);
    const res = createRes();

    await register({ body }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Validation failed.',
      errors: ['Please enter a valid email address'],
    });
  });

  it('returns 500 on unexpected failures', async () => {
    User.findOne.mockRejectedValue(new Error('db down'));
    const res = createRes();

    await register({ body }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Registration failed. Please try again.',
    });
  });
});

describe('login', () => {
  const body = { email: 'ada@example.com', password: 'password123' };

  const mockLookup = (user) => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
  };

  it.each([[{ email: undefined }], [{ password: undefined }]])(
    'requires both email and password',
    async (missing) => {
      const res = createRes();

      await login({ body: { ...body, ...missing } }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Please provide both email and password.',
      });
    }
  );

  it('rejects an unknown email with a generic message', async () => {
    mockLookup(null);
    const res = createRes();

    await login({ body }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid email or password.',
    });
  });

  it('rejects a wrong password with the same generic message', async () => {
    mockLookup(userDoc({ comparePassword: jest.fn().mockResolvedValue(false) }));
    const res = createRes();

    await login({ body }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid email or password.',
    });
  });

  it('returns a token for valid credentials', async () => {
    const comparePassword = jest.fn().mockResolvedValue(true);
    mockLookup(userDoc({ comparePassword }));
    const res = createRes();

    await login({ body }, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: body.email });
    expect(comparePassword).toHaveBeenCalledWith(body.password);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Login successful.',
      data: {
        user: { _id: 'user-1', id: 'user-1', name: 'Ada', email: 'ada@example.com' },
        token: 'signed-token',
        refreshToken: 'signed-refresh-token',
      },
    });
  });

  it('returns 500 when the lookup fails', async () => {
    User.findOne.mockImplementation(() => {
      throw new Error('db down');
    });
    const res = createRes();

    await login({ body }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Login failed. Please try again.',
    });
  });
});

describe('getMe', () => {
  it('returns the formatted current user', async () => {
    User.findById.mockResolvedValue(userDoc());
    const res = createRes();

    await getMe({ user: { _id: 'user-1' } }, res);

    expect(User.findById).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith({
      message: 'User retrieved successfully.',
      data: {
        user: { _id: 'user-1', id: 'user-1', name: 'Ada', email: 'ada@example.com' },
      },
    });
  });

  it('returns 500 when the lookup fails', async () => {
    User.findById.mockRejectedValue(new Error('db down'));
    const res = createRes();

    await getMe({ user: { _id: 'user-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to retrieve user. Please try again.',
    });
  });
});
