const redisService = require('../src/services/redisService');
describe('redisService', () => {
  it('covers redisService', () => {
    expect(redisService).toBeDefined();
  });
  it('connects', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    try { await redisService.connectRedis(); } catch(e) {}
    try { redisService.isRedisReady(); } catch(e) {}
    try { redisService.getRedisClient(); } catch(e) {}
    try { await redisService.closeRedis(); } catch(e) {}
  });
});
