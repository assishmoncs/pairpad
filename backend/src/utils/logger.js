/**
 * Structured logger for PairPad.
 *
 * - Development: human-readable console output with colours.
 * - Production / test: JSON lines for machine consumption (Pino-style) so they
 *   can be shipped to log aggregation and error tracking without extra deps.
 *
 * Usage:  const logger = require('./utils/logger');
 *         logger.info('room created', { roomCode, owner });
 */

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug'];

const IS_PROD = process.env.NODE_ENV === 'production';
const CONFIGURED_LEVEL = (process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug')).toLowerCase();

function shouldLog(level) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(CONFIGURED_LEVEL);
}

function serialize(args) {
  // Interleave a trailing object as structured context.
  let message = '';
  let context = null;
  for (const arg of args) {
    if (typeof arg === 'string') {
      message = message ? `${message} ${arg}` : arg;
    } else if (arg instanceof Error) {
      context = context || {};
      context.error = { message: arg.message, stack: arg.stack };
    } else if (arg && typeof arg === 'object') {
      context = { ...(context || {}), ...arg };
    } else if (arg !== undefined) {
      message = message ? `${message} ${String(arg)}` : String(arg);
    }
  }
  return { message, context };
}

function emit(level, args) {
  if (!shouldLog(level)) return;
  const { message, context } = serialize(args);
  const entry = {
    level,
    ts: new Date().toISOString(),
    msg: message,
    ...context,
  };

  if (IS_PROD) {
    // JSON line — safe for structured ingestion.
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  } else {
    const prefix = `[${level.toUpperCase()}]`;
    const color =
      level === 'error' || level === 'fatal' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[36m';
    const suffix = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    process.stdout.write(`${color}${prefix}\x1b[0m ${message}${suffix}\n`);
  }
}

const logger = {};

for (const level of LEVELS) {
  logger[level] = (...args) => emit(level, args);
}

/** Child logger carrying fixed context (e.g. requestId). */
logger.child = (defaults) => {
  const child = {};
  for (const level of LEVELS) {
    child[level] = (...args) => {
      // Merge defaults as trailing context; explicit args win on conflicts.
      const merged = [...args, defaults];
      emit(level, merged);
    };
  }
  return child;
};

module.exports = logger;
