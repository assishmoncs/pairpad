const logger = require('../utils/logger');
const { isConfigured, connectRedis, getRedisClient, isRedisReady } = require('./redisService');

let adapterInstalled = false;

/**
 * Install the official Socket.IO Redis adapter when both Redis and its optional
 * dependencies are available. Single-node deployments continue to work without it.
 */
const configureSocketScaling = async (io) => {
  if (!isConfigured()) return { enabled: false, reason: 'redis_not_configured' };

  try {
    await connectRedis();
    if (!isRedisReady()) return { enabled: false, reason: 'redis_not_ready' };

    // Optional dependency: production images should install both packages.
    // eslint-disable-next-line global-require
    const { createAdapter } = require('@socket.io/redis-adapter');
    const Redis = require('ioredis');
    const publisher = getRedisClient();
    const subscriber = publisher.duplicate();
    await subscriber.connect();
    io.adapter(createAdapter(publisher, subscriber));
    adapterInstalled = true;
    logger.info('Socket.IO Redis adapter enabled');
    return { enabled: true };
  } catch (error) {
    adapterInstalled = false;
    logger.error('Redis Socket.IO adapter unavailable', { message: error.message });
    if (process.env.REDIS_REQUIRED === 'true') throw error;
    return { enabled: false, reason: 'adapter_unavailable' };
  }
};

const isSocketScalingEnabled = () => adapterInstalled;

module.exports = { configureSocketScaling, isSocketScalingEnabled };
