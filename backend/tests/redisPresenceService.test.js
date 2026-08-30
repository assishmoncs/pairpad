const redisPresenceService = require('../src/services/redisPresenceService');
describe('redisPresenceService', () => {
  it('exports methods', () => {
    expect(redisPresenceService).toBeDefined();
  });
});
