jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

const axios = require('axios');

const BASE_URL = 'https://judge0.test';

// judge0Service reads its configuration at require time.
const loadService = ({ apiKey = 'test-key' } = {}) => {
  let service;
  jest.isolateModules(() => {
    process.env.JUDGE0_BASE_URL = BASE_URL;
    process.env.JUDGE0_RAPIDAPI_HOST = 'judge0.test';
    if (apiKey === null) {
      delete process.env.JUDGE0_API_KEY;
    } else {
      process.env.JUDGE0_API_KEY = apiKey;
    }
    service = require('../src/services/judge0Service');
  });
  return service;
};

const httpError = (status) => {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status };
  return error;
};

// Run the service's polling delays instantly.
let setTimeoutSpy;

beforeEach(() => {
  jest.clearAllMocks();
  setTimeoutSpy = jest
    .spyOn(global, 'setTimeout')
    .mockImplementation((fn) => {
      fn();
      return 0;
    });
});

afterEach(() => {
  setTimeoutSpy.mockRestore();
});

describe('getLanguageId', () => {
  it('maps known languages to their Judge0 ids, case-insensitively', () => {
    const { getLanguageId, LANGUAGE_MAP } = loadService();

    expect(getLanguageId('python')).toBe(LANGUAGE_MAP.python);
    expect(getLanguageId('CPP')).toBe(LANGUAGE_MAP.cpp);
    expect(getLanguageId('TypeScript')).toBe(LANGUAGE_MAP.typescript);
  });

  it('throws for unknown languages instead of silently defaulting', () => {
    const { getLanguageId } = loadService();

    expect(() => getLanguageId('cobol')).toThrow(/Unsupported language: cobol/);
  });
});

describe('submitCode', () => {
  it('throws when no API key is configured', async () => {
    const { submitCode } = loadService({ apiKey: null });

    await expect(submitCode('print(1)', 'python')).rejects.toThrow(
      /Judge0 API key not configured/
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('submits the code with the mapped language id and formats a successful result', async () => {
    const { submitCode, LANGUAGE_MAP } = loadService();
    axios.post.mockResolvedValue({ data: { token: 'tok-1' } });
    axios.get.mockResolvedValue({
      data: {
        status: { id: 3 },
        stdout: 'hello\n',
        time: '0.0123',
        memory: 1024.6,
        exit_code: 0,
        signal: null,
      },
    });

    const result = await submitCode('print("hello")', 'python', 'input');

    expect(axios.post).toHaveBeenCalledWith(
      `${BASE_URL}/submissions`,
      expect.objectContaining({
        source_code: 'print("hello")',
        language_id: LANGUAGE_MAP.python,
        stdin: 'input',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-RapidAPI-Key': 'test-key' }),
      })
    );
    expect(axios.get).toHaveBeenCalledWith(
      `${BASE_URL}/submissions/tok-1`,
      expect.any(Object)
    );
    expect(result).toEqual({
      stdout: 'hello\n',
      stderr: '',
      output: 'hello\n',
      status: 'success',
      statusCode: 3,
      time: '0.012s',
      memory: '1025KB',
      exitCode: 0,
      signal: null,
    });
  });

  it('defaults stdin to an empty string', async () => {
    const { submitCode } = loadService();
    axios.post.mockResolvedValue({ data: { token: 'tok-1' } });
    axios.get.mockResolvedValue({ data: { status: { id: 3 } } });

    await submitCode('code', 'javascript');

    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ stdin: '' }),
      expect.any(Object)
    );
  });

  it('reports compile output as stderr and maps non-success statuses', async () => {
    const { submitCode } = loadService();
    axios.post.mockResolvedValue({ data: { token: 'tok-2' } });
    axios.get.mockResolvedValue({
      data: {
        status: { id: 7 },
        compile_output: 'syntax error',
        time: null,
        memory: null,
      },
    });

    const result = await submitCode('oops', 'cpp');

    expect(result.status).toBe('compilation_error');
    expect(result.stderr).toBe('syntax error');
    expect(result.time).toBeNull();
    expect(result.memory).toBeNull();
  });

  it('maps an unrecognized status id to "unknown"', async () => {
    const { submitCode } = loadService();
    axios.post.mockResolvedValue({ data: { token: 'tok-3' } });
    axios.get.mockResolvedValue({ data: { status: { id: 99 } } });

    const result = await submitCode('code', 'javascript');

    expect(result.status).toBe('unknown');
    expect(result.statusCode).toBe(99);
  });

  it('keeps polling while the submission is still queued', async () => {
    const { submitCode } = loadService();
    axios.post.mockResolvedValue({ data: { token: 'tok-4' } });
    axios.get
      .mockResolvedValueOnce({ data: { status: { id: 1 } } })
      .mockResolvedValueOnce({ data: { status: { id: 2 } } })
      .mockResolvedValueOnce({ data: { status: { id: 3 }, stdout: 'done' } });

    const result = await submitCode('code', 'javascript');

    expect(axios.get).toHaveBeenCalledTimes(3);
    expect(result.stdout).toBe('done');
  });

  it('retries polling when the submission is not found yet', async () => {
    const { submitCode } = loadService();
    axios.post.mockResolvedValue({ data: { token: 'tok-5' } });
    axios.get
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ data: { status: { id: 3 }, stdout: 'ok' } });

    const result = await submitCode('code', 'javascript');

    expect(result.stdout).toBe('ok');
  });

  it('throws when polling fails for a non-404 reason', async () => {
    const { submitCode } = loadService();
    axios.post.mockResolvedValue({ data: { token: 'tok-6' } });
    axios.get.mockRejectedValue(httpError(500));

    await expect(submitCode('code', 'javascript')).rejects.toThrow(
      /Failed to fetch execution result/
    );
  });

  it('throws a timeout error when the result never becomes ready', async () => {
    const { submitCode } = loadService();
    axios.post.mockResolvedValue({ data: { token: 'tok-7' } });
    axios.get.mockResolvedValue({ data: { status: { id: 2 } } });

    await expect(submitCode('code', 'javascript')).rejects.toThrow(
      /Execution timed out/
    );
    expect(axios.get).toHaveBeenCalledTimes(30);
  });

  it.each([
    [401, /Invalid Judge0 API key/],
    [403, /Invalid Judge0 API key/],
    [429, /Rate limit exceeded/],
    [503, /Judge0 service unavailable/],
  ])('translates a %i submission response into a friendly error', async (status, expected) => {
    const { submitCode } = loadService();
    axios.post.mockRejectedValue(httpError(status));

    await expect(submitCode('code', 'javascript')).rejects.toThrow(expected);
  });

  it('wraps unexpected submission failures', async () => {
    const { submitCode } = loadService();
    axios.post.mockRejectedValue(new Error('socket hang up'));

    await expect(submitCode('code', 'javascript')).rejects.toThrow(
      'Judge0 submission failed: socket hang up'
    );
  });
});
