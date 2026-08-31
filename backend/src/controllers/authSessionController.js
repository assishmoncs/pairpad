const User = require('../models/User');
const logger = require('../utils/logger');
const {
  issueSession,
  rotate,
  revokeToken,
  revokeAllForUser,
} = require('../services/refreshSessionService');
const { verifyRefreshToken, generateAccessToken } = require('../utils/sessionTokens');
const { sendValidationError, sendError, sendSuccess } = require('../utils/apiResponse');
const { isValidEmail, validatePassword } = require('../utils/validation');

const COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'pairpad_refresh';
const COOKIE_MAX_AGE_MS = Number(process.env.REFRESH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);

const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const index = part.indexOf('=');
  return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
}));

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.REFRESH_COOKIE_SAMESITE || 'lax',
  path: process.env.REFRESH_COOKIE_PATH || '/api/auth',
  maxAge: COOKIE_MAX_AGE_MS,
});

const setRefreshCookie = (res, token) => res.cookie(COOKIE_NAME, token, cookieOptions());
const clearRefreshCookie = (res) => res.clearCookie(COOKIE_NAME, cookieOptions());
const getRefreshCookieName = () => COOKIE_NAME;

const authenticate = async (req, res, user, status = 200) => {
  const { refreshToken } = await issueSession({ userId: user._id, req });
  const accessToken = generateAccessToken(user._id);
  setRefreshCookie(res, refreshToken);
  return sendSuccess(res, status === 201 ? 'Registration successful.' : 'Login successful.', { user: user.toJSON(), token: accessToken }, { status });
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) return sendError(res, 400, 'Name must be between 1 and 50 characters.');
    if (!isValidEmail(email)) return sendError(res, 400, 'Please provide a valid email address.');
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return sendError(res, 400, pwCheck.error);
    const normalizedEmail = email.trim().toLowerCase();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return sendError(res, 409, 'An account with this email already exists.');
    const user = await User.create({ name: name.trim(), email: normalizedEmail, password });
    return authenticate(req, res, user, 201);
  } catch (error) {
    logger.error('Registration error', { name: error.name, message: error.message });
    if (error.name === 'ValidationError') return sendValidationError(res, error);
    return sendError(res, 500, 'Registration failed. Please try again.');
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) return sendError(res, 400, 'Please provide both email and password.');
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) return sendError(res, 401, 'Invalid email or password.');
    return authenticate(req, res, user);
  } catch (error) {
    logger.error('Login error', { name: error.name, message: error.message });
    return sendError(res, 500, 'Login failed. Please try again.');
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = parseCookies(req.headers.cookie)[getRefreshCookieName()];
    if (!refreshToken) return sendError(res, 401, 'Refresh session is missing.');
    verifyRefreshToken(refreshToken);
    const rotated = await rotate({ refreshToken, req });
    const accessToken = generateAccessToken(rotated.userId);
    setRefreshCookie(res, rotated.refreshToken);
    return sendSuccess(res, 'Session refreshed.', { token: accessToken });
  } catch (error) {
    clearRefreshCookie(res);
    return sendError(res, 401, error.code === 'REFRESH_REUSE' ? 'Refresh session was revoked. Please sign in again.' : 'Invalid or expired refresh session.');
  }
};

const logout = async (req, res) => {
  try {
    const refreshToken = parseCookies(req.headers.cookie)[getRefreshCookieName()];
    if (refreshToken) await revokeToken(refreshToken);
  } finally {
    clearRefreshCookie(res);
  }
  return sendSuccess(res, 'Logged out successfully.');
};

const logoutAll = async (req, res) => {
  await revokeAllForUser(req.user._id);
  clearRefreshCookie(res);
  return sendSuccess(res, 'All sessions have been logged out.');
};

const getMe = async (req, res) => sendSuccess(res, 'User retrieved successfully.', { user: req.user.toJSON() });

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  logoutAll,
  getMe,
  getRefreshCookieName,
};
