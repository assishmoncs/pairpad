const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const {
  sanitizeString,
  isValidEmail,
  validatePassword,
} = require('../utils/validation');
const { sendSuccess, sendError, sendValidationError } = require('../utils/apiResponse');

/** Format user object for API responses (never include password). */
const formatUser = (user) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
});

/** Build the shared auth payload returned by register and login. */
const sendAuthSuccess = (res, message, user, status) => {
  const token = generateToken(user._id);

  return sendSuccess(res, message, { user: formatUser(user), token }, { status });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return sendError(
        res,
        400,
        'Please provide all required fields: name, email, and password.'
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return sendError(res, 400, 'Please provide a valid email address.');
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return sendError(res, 400, passwordCheck.error);
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return sendError(res, 409, 'An account with this email already exists.');
    }

    const user = await User.create({
      name: sanitizeString(name).substring(0, 50),
      email: normalizedEmail,
      password,
    });

    sendAuthSuccess(res, 'Registration successful.', user, 201);
  } catch (error) {
    console.error('Register error:', error.message);

    if (error.name === 'ValidationError') {
      return sendValidationError(res, error);
    }

    sendError(res, 500, 'Registration failed. Please try again.');
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return sendError(res, 400, 'Please provide both email and password.');
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select('+password');

    if (!user) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    sendAuthSuccess(res, 'Login successful.', user);
  } catch (error) {
    console.error('Login error:', error.message);
    sendError(res, 500, 'Login failed. Please try again.');
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return sendError(res, 404, 'User not found.');
    }

    sendSuccess(res, 'User retrieved successfully.', { user: formatUser(user) });
  } catch (error) {
    console.error('Get me error:', error.message);
    sendError(res, 500, 'Failed to retrieve user. Please try again.');
  }
};

module.exports = {
  register,
  login,
  getMe,
};
