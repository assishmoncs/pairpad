// Global error handling middleware
// Ensures consistent error response format across the API

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not found middleware - handles 404 for undefined routes
 */
const notFoundMiddleware = (req, res, next) => {
  const error = new ApiError(404, `Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Global error handler middleware
 * Handles all errors and returns consistent JSON response
 */
const errorHandler = (err, req, res, next) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || [];

  // Log error for debugging (in production, use proper logging service)
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ErrorHandler] ${statusCode}: ${message}`);
    if (err.stack && process.env.NODE_ENV === 'development') {
      console.error(err.stack);
    }
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errors = Object.values(err.errors).map(e => e.message);
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value for field: ${field}`;
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Send response
  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    message,
    ...(errors.length > 0 && { errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = {
  ApiError,
  notFoundMiddleware,
  errorHandler,
};
