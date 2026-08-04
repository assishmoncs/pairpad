/**
 * Async handler wrapper for Express route handlers.
 *
 * Wraps an async handler and forwards any rejected promise to Express's error
 * middleware (next), so every unexpected error is routed through the global
 * errorHandler instead of being swallowed or crashing the process. Synchronous
 * throws are also caught and forwarded.
 *
 * Usage:  router.post('/', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  try {
    Promise.resolve(fn(req, res, next)).catch(next);
  } catch (error) {
    next(error);
  }
};

module.exports = asyncHandler;
