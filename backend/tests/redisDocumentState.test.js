const redisDocumentState = require('../src/services/redisDocumentState');
jest.mock('../src/services/redisService', () => ({
  isRedisReady: jest.fn().mockReturnValue(true),
  getRedisClient: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue('{"content":"test"}'),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    watch: jest.fn(),
    unwatch: jest.fn(),
    multi: jest.fn().mockReturnValue({ set: jest.fn(), exec: jest.fn().mockResolvedValue([{}]) })
  })
}));
describe('redisDocumentState', () => {
  it('handles state', async () => {
    await redisDocumentState.setState('R1', 'state');
    await redisDocumentState.getState('R1');
    await redisDocumentState.deleteState('R1');
    await redisDocumentState.applyOperationAtomic('R1', { type: 'replace', content: 'hello' });
  });
});
