// Tests for the asyncHandler wrapper and structured logger.

const asyncHandler = require('../src/utils/asyncHandler');
const logger = require('../src/utils/logger');

describe('asyncHandler', () => {
  it('delegates a resolved promise without calling next', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const next = jest.fn();
    const wrapped = asyncHandler(handler);

    await wrapped({}, {}, next);

    expect(handler).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards a rejected promise to next', async () => {
    const boom = new Error('async failure');
    const handler = jest.fn().mockRejectedValue(boom);
    const next = jest.fn();
    const wrapped = asyncHandler(handler);

    await wrapped({}, {}, next);

    expect(next).toHaveBeenCalledWith(boom);
  });

  it('forwards a synchronous throw to next', async () => {
    const boom = new Error('sync failure');
    const handler = jest.fn(() => {
      throw boom;
    });
    const next = jest.fn();
    const wrapped = asyncHandler(handler);

    await wrapped({}, {}, next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe('logger', () => {
  let stdoutWrite;
  beforeEach(() => {
    stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
  });
  afterEach(() => {
    stdoutWrite.mockRestore();
  });

  it('exposes the standard log levels', () => {
    for (const level of ['fatal', 'error', 'warn', 'info', 'debug']) {
      expect(typeof logger[level]).toBe('function');
    }
  });

  it('produces a child logger with fixed context', () => {
    const child = logger.child({ requestId: 'req-1' });
    expect(typeof child.info).toBe('function');
  });
});
