const jwt = require('jsonwebtoken');
const generateToken = require('../src/utils/generateToken');

const JWT_SECRET = 'test_jwt_secret_for_testing_only';

const ORIGINAL_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

afterEach(() => {
  if (ORIGINAL_EXPIRES_IN === undefined) {
    delete process.env.JWT_EXPIRES_IN;
  } else {
    process.env.JWT_EXPIRES_IN = ORIGINAL_EXPIRES_IN;
  }
});

describe('generateToken', () => {
  it('signs a token carrying the user id, verifiable with the secret', () => {
    const token = generateToken('user-1');

    expect(jwt.verify(token, JWT_SECRET)).toMatchObject({ userId: 'user-1' });
  });

  it('honours JWT_EXPIRES_IN', () => {
    process.env.JWT_EXPIRES_IN = '2h';

    const decoded = jwt.verify(generateToken('user-1'), JWT_SECRET);

    expect(decoded.exp - decoded.iat).toBe(2 * 60 * 60);
  });

  it('defaults to a one day expiry', () => {
    delete process.env.JWT_EXPIRES_IN;

    const decoded = jwt.verify(generateToken('user-1'), JWT_SECRET);

    expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60);
  });
});
