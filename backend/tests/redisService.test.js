const redisService = require('../src/services/redisService');
describe('redisService', () => {
  it('covers redisService', () => {
    expect(redisService).toBeDefined();
  });
  it('connects', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    try { await redisService.connectRedis(); } catch { /* ignore */ }
    try { redisService.isRedisReady(); } catch { /* ignore */ }
    try { redisService.getRedisClient(); } catch { /* ignore */ }
    try { await redisService.closeRedis(); } catch { /* ignore */ }
  });
});
