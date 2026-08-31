jest.mock('../src/services/judge0Service');
jest.mock('../src/services/executionWorkerService');

const executionService = require('../src/services/executionService');
const judge0Service = require('../src/services/judge0Service');
const executionWorkerService = require('../src/services/executionWorkerService');

describe('executionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes to worker when worker is configured and language is isolated', async () => {
    executionWorkerService.isWorkerConfigured.mockReturnValue(true);
    executionWorkerService.executeInWorker.mockResolvedValue({ stdout: 'worker ok' });

    const result = await executionService.executeCode('console.log(1)', 'javascript');
    expect(result).toEqual({ stdout: 'worker ok' });
    expect(executionWorkerService.executeInWorker).toHaveBeenCalledWith({
      sourceCode: 'console.log(1)',
      language: 'javascript',
      stdin: '',
    });
    expect(judge0Service.submitCode).not.toHaveBeenCalled();
  });

  it('falls through to judge0 if worker returns falsy', async () => {
    executionWorkerService.isWorkerConfigured.mockReturnValue(true);
    executionWorkerService.executeInWorker.mockResolvedValue(null);
    judge0Service.submitCode.mockResolvedValue({ stdout: 'judge0 ok' });

    const result = await executionService.executeCode('console.log(1)', 'javascript', 'input');
    expect(result).toEqual({ stdout: 'judge0 ok' });
    expect(judge0Service.submitCode).toHaveBeenCalledWith('console.log(1)', 'javascript', 'input');
  });

  it('routes non-isolated language directly to judge0', async () => {
    executionWorkerService.isWorkerConfigured.mockReturnValue(true);
    judge0Service.submitCode.mockResolvedValue({ stdout: 'python ok' });

    const result = await executionService.executeCode('print(1)', 'python');
    expect(result).toEqual({ stdout: 'python ok' });
    expect(executionWorkerService.executeInWorker).not.toHaveBeenCalled();
    expect(judge0Service.submitCode).toHaveBeenCalledWith('print(1)', 'python', '');
  });
});
