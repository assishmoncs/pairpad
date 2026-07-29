const User = require('../models/User');
const generateToken = require('../utils/generateToken');

/** Format user object for API responses (never include password). */
const formatUser = (user) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
});

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Please provide all required fields: name, email, and password.',
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        message: 'An account with this email already exists.',
      });
    }

    const user = await User.create({
      name,
      email,
      password,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Registration successful.',
      token,
      data: {
        user: formatUser(user),
        token,
      },
    });
  } catch (error) {
    console.error('Register error:', error.message);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        message: 'Validation failed.',
        errors: messages,
      });
    }

    res.status(500).json({
      message: 'Registration failed. Please try again.',
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Please provide both email and password.',
      });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid email or password.',
      });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful.',
      token,
      data: {
        user: formatUser(user),
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      message: 'Login failed. Please try again.',
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      message: 'User retrieved successfully.',
      data: {
        user: formatUser(user),
      },
    });
  } catch (error) {
    console.error('Get me error:', error.message);
    res.status(500).json({
      message: 'Failed to retrieve user. Please try again.',
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
};
