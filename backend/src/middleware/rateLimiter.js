// Rate limiting middleware using express-rate-limit
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login/register attempts per window
  message: {
    message: 'Too many authentication attempts, please try again after 15 minutes.',
  },
  skipSuccessfulRequests: false,
});

// Very strict rate limiter for code execution (expensive operation)
const executeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 code executions per minute
  message: {
    message: 'Too many code execution requests. Please wait a minute before trying again.',
  },
});

// Socket.IO connection rate limiter
const socketLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 socket connections per minute
  message: 'Too many socket connections.',
});

module.exports = {
  apiLimiter,
  authLimiter,
  executeLimiter,
  socketLimiter,
};
