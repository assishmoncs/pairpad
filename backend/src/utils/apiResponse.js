// Helpers for the API's `{ message, data }` JSON response envelope.

/**
 * Send a successful JSON response.
 * @param {import('express').Response} res
 * @param {string} message - Human readable message.
 * @param {object} [data] - Payload placed under `data` (omitted when undefined).
 * @param {{status?: number, extra?: object}} [options] - HTTP status and extra top-level fields.
 */
const sendSuccess = (res, message, data, { status = 200, extra = {} } = {}) =>
  res.status(status).json({
    message,
    ...extra,
    ...(data !== undefined && { data }),
  });

/**
 * Send an error JSON response.
 * @param {import('express').Response} res
 * @param {number} status - HTTP status code.
 * @param {string} message - Human readable message.
 * @param {object} [extra] - Extra top-level fields (e.g. `errors`).
 */
const sendError = (res, status, message, extra = {}) =>
  res.status(status).json({ message, ...extra });

/**
 * Send a 400 response built from a Mongoose ValidationError.
 */
const sendValidationError = (res, error) =>
  sendError(res, 400, 'Validation failed.', {
    errors: Object.values(error.errors).map((err) => err.message),
  });

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError,
};
