jest.mock('../src/services/redisService');

const redisPresenceService = require('../src/services/redisPresenceService');
const redisService = require('../src/services/redisService');

describe('redisPresenceService', () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      hset: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      hdel: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn().mockResolvedValue({ u1: JSON.stringify({ name: 'User 1' }) }),
    };
  });

  it('returns false/null when redis is not ready', async () => {
    redisService.getRedisClient.mockReturnValue(null);
    redisService.isRedisReady.mockReturnValue(false);

    expect(await redisPresenceService.setMember('ROOM1', 'u1', {})).toBe(false);
    expect(await redisPresenceService.removeMember('ROOM1', 'u1')).toBe(false);
    expect(await redisPresenceService.getMembers('ROOM1')).toBeNull();
    expect(await redisPresenceService.touch('ROOM1')).toBe(false);
  });

  it('performs operations when redis is ready', async () => {
    redisService.getRedisClient.mockReturnValue(mockRedis);
    redisService.isRedisReady.mockReturnValue(true);

    expect(await redisPresenceService.setMember('ROOM1', 'u1', { name: 'Alice' })).toBe(true);
    expect(mockRedis.hset).toHaveBeenCalled();

    expect(await redisPresenceService.removeMember('ROOM1', 'u1')).toBe(true);
    expect(mockRedis.hdel).toHaveBeenCalled();

    const members = await redisPresenceService.getMembers('ROOM1');
    expect(members).toEqual([{ name: 'User 1' }]);

    expect(await redisPresenceService.touch('ROOM1')).toBe(true);
    expect(mockRedis.expire).toHaveBeenCalled();
  });
});
