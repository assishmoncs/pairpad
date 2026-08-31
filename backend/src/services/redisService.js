const logger = require('../utils/logger');

let Redis = null;
try {
  // Optional dependency so local single-node development remains usable.
  Redis = require('ioredis');
} catch {
  Redis = null;
}

const REDIS_URL = process.env.REDIS_URL || '';
const REQUIRED = process.env.REDIS_REQUIRED === 'true';

let client = null;
let ready = false;

const isConfigured = () => Boolean(REDIS_URL && Redis);

const initializeRedis = () => {
  if (!isConfigured()) {
    if (REQUIRED) throw new Error('REDIS_REQUIRED=true but REDIS_URL/ioredis is unavailable.');
    return null;
  }
  if (client) return client;

  client = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5000),
  });

  client.on('ready', () => {
    ready = true;
    logger.info('Redis connection ready');
  });
  client.on('end', () => { ready = false; });
  client.on('error', (error) => {
    ready = false;
    logger.error('Redis error', { message: error.message });
  });

  return client;
};

const connectRedis = async () => {
  const redis = initializeRedis();
  if (!redis) return false;
  if (redis.status === 'ready') return true;
  await redis.connect();
  return true;
};

const getRedisClient = () => client;
const isRedisReady = () => ready && client?.status === 'ready';

const closeRedis = async () => {
  if (!client) return;
  try { await client.quit(); } finally {
    client = null;
    ready = false;
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  isRedisReady,
  isConfigured,
  closeRedis,
};
