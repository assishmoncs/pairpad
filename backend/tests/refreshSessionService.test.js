jest.mock('../src/utils/sessionTokens', () => ({
  generateRefreshToken: jest.fn((userId, familyId) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId, type: 'refresh', jti: `${userId}-${Math.random()}`, familyId: familyId || 'family-test' },
      'test-secret',
      { expiresIn: '7d' }
    );
  }),
}));

jest.mock('../src/models/RefreshSession', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const RefreshSession = require('../src/models/RefreshSession');
const { rotate, hashTokenId } = require('../src/services/refreshSessionService');

const makeToken = ({ userId = 'user-1', jti = 'token-1', familyId = 'family-1' } = {}) =>
  jwt.sign({ userId, type: 'refresh', jti, familyId }, 'test-secret', { expiresIn: '7d' });

describe('refresh session rotation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    RefreshSession.create.mockResolvedValue({});
    RefreshSession.updateOne.mockResolvedValue({ modifiedCount: 1 });
    RefreshSession.updateMany.mockResolvedValue({ modifiedCount: 1 });
  });

  test('rotates an active session and revokes the previous token', async () => {
    const token = makeToken();
    RefreshSession.findOne.mockResolvedValue({
      _id: 'session-1',
      user: { toString: () => 'user-1' },
      familyId: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const result = await rotate({ refreshToken: token });
    expect(result.userId).toBe('user-1');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(RefreshSession.updateOne).toHaveBeenCalledWith(
      { _id: 'session-1', revokedAt: null },
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date), replacedBy: expect.any(String) }) })
    );
    expect(RefreshSession.create).toHaveBeenCalled();
  });

  test('revokes the family when a rotated token is reused', async () => {
    const token = makeToken();
    RefreshSession.findOne.mockResolvedValue({
      _id: 'session-1',
      user: { toString: () => 'user-1' },
      familyId: 'family-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    await expect(rotate({ refreshToken: token })).rejects.toMatchObject({ code: 'REFRESH_REUSE' });
    expect(RefreshSession.updateMany).toHaveBeenCalledWith(
      { familyId: 'family-1', revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } }
    );
  });

  test('hashes token identifiers before persistence', () => {
    const hash = hashTokenId('abc');
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe('abc');
  });

  test('issueSession creates a new refresh session', async () => {
    const req = { get: jest.fn().mockReturnValue('UserAgent/1.0'), ip: '127.0.0.1' };
    const { issueSession } = require('../src/services/refreshSessionService');
    const result = await issueSession({ userId: 'u1', req });
    expect(result.refreshToken).toBeDefined();
    expect(RefreshSession.create).toHaveBeenCalled();

    // without req or familyId
    await issueSession({ userId: 'u2' });
  });

  test('rotate handles missing session, expired session, and mismatched user', async () => {
    const token = makeToken({ userId: 'u1' });

    // Missing session
    RefreshSession.findOne.mockResolvedValueOnce(null);
    await expect(rotate({ refreshToken: token })).rejects.toMatchObject({ code: 'REFRESH_REUSE' });

    // Expired session
    RefreshSession.findOne.mockResolvedValueOnce({
      _id: 's1',
      user: { toString: () => 'u1' },
      familyId: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 10000),
    });
    await expect(rotate({ refreshToken: token })).rejects.toMatchObject({ code: 'REFRESH_REUSE' });

    // Mismatched user
    RefreshSession.findOne.mockResolvedValueOnce({
      _id: 's2',
      user: { toString: () => 'different-user' },
      familyId: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
    await expect(rotate({ refreshToken: token })).rejects.toMatchObject({ code: 'REFRESH_REUSE' });

    // Modified count !== 1
    RefreshSession.findOne.mockResolvedValueOnce({
      _id: 's3',
      user: { toString: () => 'u1' },
      familyId: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
    RefreshSession.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    await expect(rotate({ refreshToken: token })).rejects.toMatchObject({ code: 'REFRESH_REUSE' });
  });

  test('revokeToken and revokeAllForUser', async () => {
    const { revokeToken, revokeAllForUser, getRefreshCookieName } = require('../src/services/refreshSessionService');
    expect(getRefreshCookieName()).toBeDefined();

    // revokeToken with valid token
    const token = makeToken();
    await revokeToken(token);
    expect(RefreshSession.updateOne).toHaveBeenCalled();

    // revokeToken with null / empty token
    await revokeToken(null);

    // revokeToken with token missing jti
    const badToken = jwt.sign({ foo: 'bar' }, 'test-secret');
    await revokeToken(badToken);

    // revokeAllForUser
    await revokeAllForUser('u1');
    expect(RefreshSession.updateMany).toHaveBeenCalledWith({ user: 'u1', revokedAt: null }, expect.any(Object));
  });
});
