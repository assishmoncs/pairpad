jest.mock('../src/services/redisService');
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn() }));

const socketScaling = require('../src/services/socketScaling');
const redisService = require('../src/services/redisService');

describe('socketScaling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REDIS_REQUIRED;
  });

  it('handles redis_not_configured', async () => {
    redisService.isConfigured.mockReturnValue(false);
    const res = await socketScaling.configureSocketScaling({});
    expect(res.enabled).toBe(false);
    expect(res.reason).toBe('redis_not_configured');
    expect(socketScaling.isSocketScalingEnabled()).toBe(false);
  });

  it('handles redis_not_ready', async () => {
    redisService.isConfigured.mockReturnValue(true);
    redisService.connectRedis.mockResolvedValue();
    redisService.isRedisReady.mockReturnValue(false);

    const res = await socketScaling.configureSocketScaling({});
    expect(res.enabled).toBe(false);
    expect(res.reason).toBe('redis_not_ready');
  });

  it('handles successful scaling installation', async () => {
    redisService.isConfigured.mockReturnValue(true);
    redisService.connectRedis.mockResolvedValue();
    redisService.isRedisReady.mockReturnValue(true);

    const mockSub = { connect: jest.fn().mockResolvedValue() };
    const mockPub = { duplicate: jest.fn().mockReturnValue(mockSub) };
    redisService.getRedisClient.mockReturnValue(mockPub);

    const io = { adapter: jest.fn() };
    const res = await socketScaling.configureSocketScaling(io);
    expect(res.enabled).toBe(true);
    expect(socketScaling.isSocketScalingEnabled()).toBe(true);
  });

  it('handles adapter error with REDIS_REQUIRED false', async () => {
    redisService.isConfigured.mockReturnValue(true);
    redisService.connectRedis.mockRejectedValue(new Error('fail'));

    const res = await socketScaling.configureSocketScaling({});
    expect(res.enabled).toBe(false);
    expect(res.reason).toBe('adapter_unavailable');
  });

  it('handles adapter error with REDIS_REQUIRED true', async () => {
    process.env.REDIS_REQUIRED = 'true';
    redisService.isConfigured.mockReturnValue(true);
    redisService.connectRedis.mockRejectedValue(new Error('fatal'));

    await expect(socketScaling.configureSocketScaling({})).rejects.toThrow('fatal');
  });
});
