// Tests for the hardened local code-execution sandbox.
// Verifies the child environment is scrubbed of secrets, unsupported languages
// are rejected without touching the filesystem, and simple Node programs run.

jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

// Load the service with a known set of secrets in the environment.
const loadService = () => {
  let service;
  jest.isolateModules(() => {
    process.env.JUDGE0_API_KEY = 'super-secret-key';
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.MONGODB_URI = 'mongodb://secret-uri';
    service = require('../src/services/judge0Service');
  });
  return service;
};

const ORIGINAL = {
  NODE_ENV: process.env.NODE_ENV,
  JUDGE0_API_KEY: process.env.JUDGE0_API_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  MONGODB_URI: process.env.MONGODB_URI,
};

afterAll(() => {
  if (ORIGINAL.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL.NODE_ENV;
  if (ORIGINAL.JUDGE0_API_KEY === undefined) delete process.env.JUDGE0_API_KEY;
  else process.env.JUDGE0_API_KEY = ORIGINAL.JUDGE0_API_KEY;
  if (ORIGINAL.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL.JWT_SECRET;
  if (ORIGINAL.MONGODB_URI === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = ORIGINAL.MONGODB_URI;
});

describe('buildChildEnv', () => {
  it('never leaks application secrets into the child environment', () => {
    const { buildChildEnv } = loadService();
    const env = buildChildEnv();

    expect(env.JUDGE0_API_KEY).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
    expect(env.MONGODB_URI).toBeUndefined();
    // Always provides a working PATH so the runtime can resolve.
    expect(env.PATH).toBeDefined();
  });
});

describe('executeLocally', () => {
  it('returns null for an unsupported language', async () => {
    const { executeLocally } = loadService();

    const result = await executeLocally('fn main(){}', 'rust');
    expect(result).toBeNull();
  });

  it('executes a trivial Node program and reports success', async () => {
    const { executeLocally } = loadService();

    const result = await executeLocally('console.log("hello sandbox")', 'javascript');

    expect(result.status).toBe('success');
    expect(result.stdout).toContain('hello sandbox');
    expect(result.exitCode).toBe(0);
  }, 15000);

  it('reports a non-zero exit code as a runtime error', async () => {
    const { executeLocally } = loadService();

    const result = await executeLocally('process.exit(3)', 'javascript');

    expect(result.status).toBe('runtime_error');
    expect(result.exitCode).toBe(3);
  }, 15000);

  it('caps stdout so runaway output cannot exhaust memory', async () => {
    const { executeLocally } = loadService();

    // ~1.5MB of output is above the 1MB cap.
    const result = await executeLocally(
      'process.stdout.write("x".repeat(1024 * 1024 * 1.5))',
      'javascript'
    );

    expect(result.status).toBe('success');
    // The captured stdout must never exceed the cap.
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024 * 1024 + 1);
  }, 15000);
});

describe('isLocalExecutionAllowed', () => {
  it('is disabled in production unless explicitly enabled', () => {
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_LOCAL_EXECUTION;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_LOCAL_EXECUTION;

    const { isLocalExecutionAllowed } = loadService();
    expect(isLocalExecutionAllowed()).toBe(false);

    process.env.ALLOW_LOCAL_EXECUTION = 'true';
    expect(isLocalExecutionAllowed()).toBe(true);

    process.env.NODE_ENV = prev;
    if (prevFlag === undefined) delete process.env.ALLOW_LOCAL_EXECUTION;
    else process.env.ALLOW_LOCAL_EXECUTION = prevFlag;
  });

  it('is allowed in non-production environments by default', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_LOCAL_EXECUTION;

    const { isLocalExecutionAllowed } = loadService();
    expect(isLocalExecutionAllowed()).toBe(true);

    process.env.NODE_ENV = prev;
  });
});
