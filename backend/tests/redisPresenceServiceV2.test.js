const redisPresenceServiceV2 = require('../src/services/redisPresenceServiceV2');
jest.mock('../src/services/redisService', () => ({
  isRedisReady: jest.fn().mockReturnValue(true),
  getRedisClient: jest.fn().mockReturnValue({
    zadd: jest.fn(),
    zrem: jest.fn(),
    zrangebyscore: jest.fn().mockResolvedValue(['expired1']),
    hset: jest.fn(),
    hgetall: jest.fn().mockResolvedValue({ a: '{}' }),
    hdel: jest.fn(),
    expire: jest.fn()
  })
}));

describe('redisPresenceServiceV2', () => {
  it('covers presence v2', async () => {
    await redisPresenceServiceV2.upsert('R1', 'soc1', {});
    await redisPresenceServiceV2.remove('R1', 'soc1');
    await redisPresenceServiceV2.refresh('R1', 'soc1');
    await redisPresenceServiceV2.list('R1');
  });
});
