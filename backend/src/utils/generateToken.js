const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generate a short-lived access token (15 minutes).
 * @param {string} userId
 * @returns {string}
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
};

/**
 * Generate a long-lived refresh token (7 days).
 * @param {string} userId
 * @returns {string}
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh', jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

/** Legacy alias: generates an access token. */
const generateToken = generateAccessToken;

module.exports = { generateToken, generateAccessToken, generateRefreshToken };
