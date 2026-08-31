const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../src/utils/sessionTokens');

describe('session tokens', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-for-session-tokens';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  test('access token is short-lived and typed as access', () => {
    const token = generateAccessToken('user-123');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe('user-123');
    expect(decoded.type).toBe('access');
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  test('refresh token contains jti and family id', () => {
    const token = generateRefreshToken('user-123', 'family-123');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe('user-123');
    expect(decoded.type).toBe('refresh');
    expect(decoded.jti).toEqual(expect.any(String));
    expect(decoded.familyId).toBe('family-123');

    // default familyId
    const token2 = generateRefreshToken('user-123');
    expect(token2).toBeDefined();
  });

  test('verifyRefreshToken verifies and rejects non-refresh token', () => {
    const { verifyRefreshToken } = require('../src/utils/sessionTokens');
    const refreshToken = generateRefreshToken('user-123');
    const decoded = verifyRefreshToken(refreshToken);
    expect(decoded.userId).toBe('user-123');

    const accessToken = generateAccessToken('user-123');
    expect(() => verifyRefreshToken(accessToken)).toThrow('Invalid token type.');
  });
});
