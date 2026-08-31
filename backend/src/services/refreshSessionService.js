const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshSession = require('../models/RefreshSession');
const { generateRefreshToken } = require('../utils/sessionTokens');

const getRefreshCookieName = () => process.env.REFRESH_COOKIE_NAME || 'pairpad_refresh';
const hashTokenId = (tokenId) => crypto.createHash('sha256').update(tokenId).digest('hex');

const decodeRefreshToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded?.type !== 'refresh' || !decoded?.jti || !decoded?.userId || !decoded?.familyId) {
    throw new Error('Invalid refresh token.');
  }
  return decoded;
};

const issueSession = async ({ userId, familyId, req }) => {
  const resolvedFamilyId = familyId || crypto.randomUUID();
  const refreshToken = generateRefreshToken(userId, resolvedFamilyId);
  const decoded = jwt.decode(refreshToken);
  if (!decoded?.jti || !decoded?.exp) throw new Error('Failed to issue refresh session.');
  await RefreshSession.create({
    user: userId,
    tokenId: hashTokenId(decoded.jti),
    familyId: resolvedFamilyId,
    expiresAt: new Date(decoded.exp * 1000),
    userAgent: req?.get?.('user-agent')?.slice(0, 500),
    ipAddress: req?.ip?.slice(0, 100),
  });
  return { refreshToken, familyId: resolvedFamilyId };
};

const rotate = async ({ refreshToken, req }) => {
  const decoded = decodeRefreshToken(refreshToken);
  const tokenId = hashTokenId(decoded.jti);
  const session = await RefreshSession.findOne({ tokenId });

  if (!session) {
    await RefreshSession.updateMany({ familyId: decoded.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw Object.assign(new Error('Refresh session is no longer valid.'), { code: 'REFRESH_REUSE' });
  }
  if (session.revokedAt || session.expiresAt <= new Date() || session.user.toString() !== decoded.userId.toString()) {
    await RefreshSession.updateMany({ familyId: session.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw Object.assign(new Error('Refresh session is no longer valid.'), { code: 'REFRESH_REUSE' });
  }

  const nextToken = generateRefreshToken(decoded.userId, session.familyId);
  const nextDecoded = jwt.decode(nextToken);
  const nextTokenId = hashTokenId(nextDecoded.jti);
  const result = await RefreshSession.updateOne(
    { _id: session._id, revokedAt: null },
    { $set: { revokedAt: new Date(), replacedBy: nextTokenId } }
  );
  if (result.modifiedCount !== 1) {
    await RefreshSession.updateMany({ familyId: session.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw Object.assign(new Error('Refresh session is no longer valid.'), { code: 'REFRESH_REUSE' });
  }

  await RefreshSession.create({
    user: session.user,
    tokenId: nextTokenId,
    familyId: session.familyId,
    expiresAt: new Date(nextDecoded.exp * 1000),
    userAgent: req?.get?.('user-agent')?.slice(0, 500),
    ipAddress: req?.ip?.slice(0, 100),
  });
  return { userId: decoded.userId, refreshToken: nextToken };
};

const revokeToken = async (refreshToken) => {
  if (!refreshToken) return;
  try {
    const decoded = jwt.decode(refreshToken);
    if (!decoded?.jti) return;
    await RefreshSession.updateOne({ tokenId: hashTokenId(decoded.jti), revokedAt: null }, { $set: { revokedAt: new Date() } });
  } catch {
    // Logout is intentionally idempotent.
  }
};

const revokeAllForUser = async (userId) => {
  await RefreshSession.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
};

module.exports = { getRefreshCookieName, hashTokenId, issueSession, rotate, revokeToken, revokeAllForUser };
