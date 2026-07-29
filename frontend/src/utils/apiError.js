/**
 * Read the API error message from an axios error, falling back to a default.
 * @param {unknown} error - Error thrown by axios (or anything else).
 * @param {string} fallback - Message shown when the API did not provide one.
 * @returns {string}
 */
export const getErrorMessage = (error, fallback) =>
  error?.response?.data?.message || fallback;
