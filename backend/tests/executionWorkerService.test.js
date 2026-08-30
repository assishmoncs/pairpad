jest.mock('axios', () => ({ post: jest.fn() }));


describe('execution worker client contract', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXECUTION_WORKER_URL = 'http://worker:7000';
    process.env.EXECUTION_WORKER_TOKEN = 'test-worker-token';
  });

  afterEach(() => {
    delete process.env.EXECUTION_WORKER_URL;
    delete process.env.EXECUTION_WORKER_TOKEN;
  });

  test('configured worker sends authenticated execution request', async () => {
    const axiosMock = require('axios');
    axiosMock.post.mockResolvedValue({ status: 200, data: { result: { status: 'success', output: 'ok' } } });
    const { executeInWorker, isWorkerConfigured } = require('../src/services/executionWorkerService');

    expect(isWorkerConfigured()).toBe(true);
    await expect(executeInWorker({ sourceCode: 'console.log(1)', language: 'javascript', stdin: '' }))
      .resolves.toEqual({ status: 'success', output: 'ok' });
    expect(axiosMock.post).toHaveBeenCalledWith(
      'http://worker:7000/execute',
      { sourceCode: 'console.log(1)', language: 'javascript', stdin: '' },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-worker-token' }),
      })
    );
  });

  test('worker errors are surfaced to execution layer', async () => {
    const axiosMock = require('axios');
    axiosMock.post.mockResolvedValue({ status: 503, data: { error: 'worker unavailable' } });
    const { executeInWorker } = require('../src/services/executionWorkerService');
    await expect(executeInWorker({ sourceCode: '1', language: 'javascript' }))
      .rejects.toThrow('worker unavailable');
  });
});
