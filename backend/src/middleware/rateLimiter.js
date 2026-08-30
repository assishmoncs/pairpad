// Rate limiting middleware using express-rate-limit
const rateLimit = require('express-rate-limit');

const skipInTest = () => process.env.NODE_ENV === 'test' && process.env.TEST_RATE_LIMITER !== 'true';

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

// Stricter rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login/register attempts per window
  message: {
    message: 'Too many authentication attempts, please try again after 15 minutes.',
  },
  skipSuccessfulRequests: false,
  skip: skipInTest,
});

// Very strict rate limiter for code execution (expensive operation)
const executeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 code executions per minute
  message: {
    message: 'Too many code execution requests. Please wait a minute before trying again.',
  },
  skip: skipInTest,
});

// Socket.IO connection rate limiter
const socketLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 socket connections per minute
  message: 'Too many socket connections.',
  skip: skipInTest,
});

module.exports = {
  apiLimiter,
  authLimiter,
  executeLimiter,
  socketLimiter,
};
