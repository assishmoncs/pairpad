const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const parseLimit = (value, fallback = DEFAULT_LIMIT) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
};

const parseBeforeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, parseLimit, parseBeforeDate };
