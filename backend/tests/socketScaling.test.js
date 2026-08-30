describe('socket scaling configuration', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.REDIS_URL;
    delete process.env.REDIS_REQUIRED;
  });

  test('falls back to single-node mode when Redis is not configured', () => {
    jest.resetModules();
    const scaling = require('../src/services/socketScaling');
    expect(scaling.isSocketScalingEnabled()).toBe(false);
  });

  test('presence service is safe when Redis is unavailable', async () => {
    jest.resetModules();
    const presence = require('../src/services/redisPresenceServiceV2');
    expect(await presence.list('ABC123')).toBe(null);
    expect(await presence.upsert('ABC123', 'socket-1', { userId: 'user-1', name: 'Alice' })).toBe(false);
    expect(await presence.remove('ABC123', 'socket-1')).toBe(false);
  });
});
