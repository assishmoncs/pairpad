// Shared JWT verification used by both the HTTP middleware and the Socket.IO handshake.

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verify a JWT and load the matching user (without the password field).
 * @param {string} token - Raw JWT.
 * @returns {Promise<object|null>} The user, or null when no user matches the token.
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError} When the token is invalid or expired.
 */
const getUserFromToken = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // Reject refresh tokens used as access tokens
  if (decoded.type === 'refresh') {
    throw new jwt.JsonWebTokenError('Refresh tokens cannot be used for authentication.');
  }
  return User.findById(decoded.userId).select('-password');
};

module.exports = { getUserFromToken };
