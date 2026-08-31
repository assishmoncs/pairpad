jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

const axios = require('axios');
const BASE_URL = 'https://judge0.test';

process.env.JUDGE0_BASE_URL = BASE_URL;
process.env.JUDGE0_RAPIDAPI_HOST = 'judge0.test';
process.env.JUDGE0_API_KEY = 'test-key';
const service = require('../src/services/judge0Service');

const httpError = (status) => {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status };
  return error;
};

let setTimeoutSpy;
beforeEach(() => {
  jest.clearAllMocks();
  setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn) => { fn(); return 0; });
});
afterEach(() => {
  setTimeoutSpy.mockRestore();
});

describe('getLanguageId', () => {
  it('maps known languages', () => {
    expect(service.getLanguageId('python')).toBe(service.LANGUAGE_MAP.python);
  });
  it('throws for unknown languages', () => {
    expect(() => service.getLanguageId('cobol')).toThrow(/Unsupported language: cobol/);
  });
});

describe('submitCode', () => {
  it('submits the code', async () => {
    axios.post.mockResolvedValue({ data: { token: 'tok-1' } });
    axios.get.mockResolvedValue({
      data: { status: { id: 3 }, stdout: 'hello\n', time: '0.0123', memory: 1024.6, exit_code: 0, signal: null },
    });
    const result = await service.submitCode('print("hello")', 'python', 'input');
    expect(result.status).toBe('success');
  });

  it('reports compile output', async () => {
    axios.post.mockResolvedValue({ data: { token: 'tok-2' } });
    axios.get.mockResolvedValue({
      data: { status: { id: 7 }, compile_output: 'syntax error', time: null, memory: null },
    });
    const result = await service.submitCode('oops', 'cpp');
    expect(result.status).toBe('compilation_error');
  });

  it('keeps polling', async () => {
    axios.post.mockResolvedValue({ data: { token: 'tok-4' } });
    axios.get
      .mockResolvedValueOnce({ data: { status: { id: 1 } } })
      .mockResolvedValueOnce({ data: { status: { id: 2 } } })
      .mockResolvedValueOnce({ data: { status: { id: 3 }, stdout: 'done' } });
    const result = await service.submitCode('code', 'javascript');
    expect(result.stdout).toBe('done');
  });

  it('retries polling when 404', async () => {
    axios.post.mockResolvedValue({ data: { token: 'tok-5' } });
    axios.get.mockRejectedValueOnce(httpError(404)).mockResolvedValueOnce({ data: { status: { id: 3 }, stdout: 'ok' } });
    const result = await service.submitCode('code', 'javascript');
    expect(result.stdout).toBe('ok');
  });

  it('throws timeout', async () => {
    axios.post.mockResolvedValue({ data: { token: 'tok-7' } });
    axios.get.mockResolvedValue({ data: { status: { id: 2 } } });
    await expect(service.submitCode('code', 'javascript')).rejects.toThrow(/Execution timed out/);
  });

  it.each([
    [401, /Invalid Judge0 API key/],
    [403, /Invalid Judge0 API key/],
    [429, /Rate limit exceeded/],
    [503, /Judge0 service unavailable/],
  ])('translates a %i error', async (status, expected) => {
    axios.post.mockRejectedValue(httpError(status));
    await expect(service.submitCode('code', 'javascript')).rejects.toThrow(expected);
  });
});
