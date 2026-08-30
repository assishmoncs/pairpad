const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const generateAccessToken = (userId) =>
  jwt.sign({ userId, type: 'access' }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES_IN });

const generateRefreshToken = (userId, familyId = crypto.randomUUID()) =>
  jwt.sign(
    { userId, type: 'refresh', jti: crypto.randomUUID(), familyId },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );

module.exports = { generateAccessToken, generateRefreshToken, ACCESS_EXPIRES_IN, REFRESH_EXPIRES_IN };
