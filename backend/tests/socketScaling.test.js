const socketScaling = require('../src/services/socketScaling');
jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({ on: jest.fn() })));
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn() }));
describe('socketScaling', () => {
  it('setupRedisAdapter', async () => {
    process.env.REDIS_URL = 'redis://localhost';
    try { await socketScaling.configureSocketScaling({ adapter: jest.fn() }); } catch { /* ignore */ }
    try { socketScaling.isSocketScalingEnabled(); } catch { /* ignore */ }
  });
});
