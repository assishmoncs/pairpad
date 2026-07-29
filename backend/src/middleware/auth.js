const { getUserFromToken } = require('../utils/tokenAuth');
const { sendError } = require('../utils/apiResponse');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 401, 'Authorization required. Please provide a valid token.');
    }

    const user = await getUserFromToken(authHeader.split(' ')[1]);

    if (!user) {
      return sendError(res, 401, 'User not found. Token may be invalid.');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return sendError(res, 401, 'Invalid token format.');
    }
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 401, 'Token has expired. Please login again.');
    }
    console.error('Auth middleware error:', error.message);
    return sendError(res, 500, 'Authentication failed. Please try again.');
  }
};

module.exports = authMiddleware;
