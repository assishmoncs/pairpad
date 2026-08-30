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
});
