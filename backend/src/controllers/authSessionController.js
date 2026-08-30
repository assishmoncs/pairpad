const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { generateAccessToken } = require('../utils/sessionTokens');
const { validatePassword, sanitizeString, isValidEmail } = require('../utils/validation');
const { sendSuccess, sendError, sendValidationError } = require('../utils/apiResponse');
const {
  getRefreshCookieName,
  issueSession,
  rotate,
  revokeToken,
  revokeAllForUser,
} = require('../services/refreshSessionService');

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.REFRESH_COOKIE_SAMESITE || 'lax',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const clearCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.REFRESH_COOKIE_SAMESITE || 'lax',
  path: '/api/auth',
});

const parseCookies = (header = '') => header.split(';').reduce((cookies, pair) => {
  const index = pair.indexOf('=');
  if (index <= 0) return cookies;
  cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  return cookies;
}, {});

const setRefreshCookie = (res, token) => {
  const options = cookieOptions();
  const parts = [
    `${getRefreshCookieName()}=${encodeURIComponent(token)}`,
    `Max-Age=${Math.floor(options.maxAge / 1000)}`,
    `Path=${options.path}`,
    'HttpOnly',
    `SameSite=${options.sameSite}`,
  ];
  if (options.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const clearRefreshCookie = (res) => {
  const options = clearCookieOptions();
  const parts = [
    `${getRefreshCookieName()}=`,
    'Max-Age=0',
    `Path=${options.path}`,
    'HttpOnly',
    `SameSite=${options.sameSite}`,
  ];
  if (options.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const formatUser = (user) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
});

const authenticate = async (req, res, user, status = 200) => {
  const session = await issueSession({ userId: user._id, req });
  setRefreshCookie(res, session.refreshToken);
  sendSuccess(res, status === 201 ? 'Registration successful.' : 'Login successful.', {
    user: formatUser(user),
    token: generateAccessToken(user._id),
  }, { status });
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !name.trim() || !email.trim() || !password) {
      return sendError(res, 400, 'Please provide all required fields: name, email, and password.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) return sendError(res, 400, 'Please provide a valid email address.');
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) return sendError(res, 400, passwordCheck.error);
    if (await User.findOne({ email: normalizedEmail })) return sendError(res, 409, 'An account with this email already exists.');
    const user = await User.create({ name: sanitizeString(name).slice(0, 50), email: normalizedEmail, password });
    return authenticate(req, res, user, 201);
  } catch (error) {
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
    return sendError(res, 500, 'Login failed. Please try again.');
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = parseCookies(req.headers.cookie)[getRefreshCookieName()];
    if (!refreshToken) return sendError(res, 401, 'Refresh session is missing.');
    const rotated = await rotate({ refreshToken, req });
    const user = await User.findById(rotated.userId);
    if (!user) {
      await revokeToken(rotated.refreshToken);
      clearRefreshCookie(res);
      return sendError(res, 401, 'User not found.');
    }
    setRefreshCookie(res, rotated.refreshToken);
    return sendSuccess(res, 'Token refreshed successfully.', { token: generateAccessToken(user._id) });
  } catch (error) {
    clearRefreshCookie(res);
    const status = error.name === 'TokenExpiredError' || error.code === 'REFRESH_REUSE' || error.message === 'Invalid refresh token.' ? 401 : 500;
    return sendError(res, status, status === 401 ? 'Refresh session is invalid or expired. Please login again.' : 'Failed to refresh token. Please try again.');
  }
};

const logout = async (req, res) => {
  try {
    const refreshToken = parseCookies(req.headers.cookie)[getRefreshCookieName()];
    await revokeToken(refreshToken);
  } finally {
    clearRefreshCookie(res);
    sendSuccess(res, 'Logged out successfully.');
  }
};

const logoutAll = async (req, res) => {
  await revokeAllForUser(req.user._id);
  clearRefreshCookie(res);
  sendSuccess(res, 'All sessions have been revoked.');
};

const getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return sendError(res, 404, 'User not found.');
  return sendSuccess(res, 'User retrieved successfully.', { user: formatUser(user) });
};

const verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

module.exports = { register, login, refreshAccessToken, logout, logoutAll, getMe, verifyAccessToken };
