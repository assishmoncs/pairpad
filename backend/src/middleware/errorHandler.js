// Global error handling middleware.
// Ensures consistent, logged, request-id-tagged JSON error responses.

const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

/**
 * Custom error class for known/operational API errors.
 *
 * Signature preserved for backward compatibility:
 *   new ApiError(statusCode, message, errors[])
 *
 * `code` is derived at response time unless the error carries an explicit one.
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = [], { code } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.errors = errors;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Alias for teams that prefer the more semantic name. */
const AppError = ApiError;

/** Attach/read a request id used for correlation across logs. */
const getRequestId = (req) => {
  if (!req.requestId) {
    req.requestId = req.headers && req.headers['x-request-id'] ? req.headers['x-request-id'] : randomUUID();
  }
  return req.requestId;
};

/**
 * Middleware that tags every request with a request id and logs a start/end
 * line. Register before routes.
 */
const requestLogger = (req, res, next) => {
  req.requestId = getRequestId(req);
  req.log = logger.child({ requestId: req.requestId });

  const started = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - started;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    (req.log || logger)[level]('request completed', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
};

/** 404 for undefined routes. */
const notFoundMiddleware = (req, res, next) => {
  const error = new ApiError(404, `Route ${req.originalUrl} not found`, [], {
    code: 'ROUTE_NOT_FOUND',
  });
  next(error);
};

/** Centralized error handler. Runs last. */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const log = req && req.log ? req.log : logger;

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || (err.isOperational ? `ERR_${statusCode}` : undefined);
  let errors = err.errors || [];
  const extra = err.extra || {};

  // Map common Mongoose / JWT errors into clean responses.
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    errors = Object.values(err.errors || {}).map((e) => e.message);
    message = 'Validation failed.';
  } else if (err.code === 11000) {
    statusCode = 400;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0];
    message = `Duplicate value for field: ${field || 'unknown'}`;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token expired';
  }

  // Server errors are always logged as errors with stack traces.
  if (statusCode >= 500) {
    log.error(message, { statusCode, code, errors, stack: err.stack });
  } else {
    log.warn(message, { statusCode, code, errors });
  }

  const body = {
    status: statusCode >= 500 ? 'error' : 'fail',
    code,
    message,
    ...(errors.length > 0 && { errors }),
    ...extra,
    ...(req && req.requestId && { requestId: req.requestId }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  res.status(statusCode).json(body);
};

module.exports = {
  ApiError,
  AppError,
  requestLogger,
  notFoundMiddleware,
  errorHandler,
};
