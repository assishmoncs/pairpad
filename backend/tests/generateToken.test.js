const jwt = require('jsonwebtoken');
const {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
} = require('../src/utils/generateToken');

const JWT_SECRET = 'test_jwt_secret_for_testing_only';

const ORIGINAL_ACCESS = process.env.JWT_ACCESS_EXPIRES_IN;
const ORIGINAL_REFRESH = process.env.JWT_REFRESH_EXPIRES_IN;

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

afterEach(() => {
  if (ORIGINAL_ACCESS === undefined) {
    delete process.env.JWT_ACCESS_EXPIRES_IN;
  } else {
    process.env.JWT_ACCESS_EXPIRES_IN = ORIGINAL_ACCESS;
  }
  if (ORIGINAL_REFRESH === undefined) {
    delete process.env.JWT_REFRESH_EXPIRES_IN;
  } else {
    process.env.JWT_REFRESH_EXPIRES_IN = ORIGINAL_REFRESH;
  }
});

describe('generateAccessToken', () => {
  it('signs a token carrying the user id and type=access', () => {
    const token = generateAccessToken('user-1');
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded).toMatchObject({ userId: 'user-1', type: 'access' });
  });

  it('honours JWT_ACCESS_EXPIRES_IN', () => {
    process.env.JWT_ACCESS_EXPIRES_IN = '2h';

    const decoded = jwt.verify(generateAccessToken('user-1'), JWT_SECRET);

    expect(decoded.exp - decoded.iat).toBe(2 * 60 * 60);
  });

  it('defaults to a 15 minute expiry', () => {
    delete process.env.JWT_ACCESS_EXPIRES_IN;

    const decoded = jwt.verify(generateAccessToken('user-1'), JWT_SECRET);

    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });
});

describe('generateRefreshToken', () => {
  it('signs a token carrying the user id and type=refresh', () => {
    const token = generateRefreshToken('user-1');
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded).toMatchObject({ userId: 'user-1', type: 'refresh' });
    expect(decoded.jti).toBeDefined();
  });

  it('defaults to a 7 day expiry', () => {
    delete process.env.JWT_REFRESH_EXPIRES_IN;

    const decoded = jwt.verify(generateRefreshToken('user-1'), JWT_SECRET);

    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
  });
});

describe('generateToken (legacy alias)', () => {
  it('is an alias for generateAccessToken', () => {
    expect(generateToken).toBe(generateAccessToken);
  });
});
