const { before, after, beforeEach, describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');

describe('isolated execution worker', () => {
  let server;
  let child;
  let spawn;
  let url;

  before(() => {
    process.env.EXECUTION_WORKER_TOKEN = 'test-worker-token';
    process.env.MAX_OUTPUT_BYTES = '8';
    spawn = mock.method(childProcess, 'spawn', () => child);
    const app = require('../src/server');
    return new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        url = `http://127.0.0.1:${server.address().port}/execute`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    mock.restoreAll();
    delete process.env.EXECUTION_WORKER_TOKEN;
    delete process.env.MAX_OUTPUT_BYTES;
  });

  beforeEach(() => {
    spawn.mock.resetCalls();
    child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.kill = mock.fn();
    child.stdin.end = mock.fn(() => {
      child.stdout.emit('data', Buffer.from('ok'));
      child.emit('close', 0, null);
    });
  });

  const execute = async (payload) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-worker-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200);
    return response.json();
  };

  it('sends source and program input to an interactive container without host mounts', async () => {
    const payload = {
      sourceCode: 'console.log("ok")',
      stdin: 'input',
      language: 'javascript',
    };
    const { result } = await execute(payload);
    assert.equal(result.status, 'success');
    assert.equal(result.stdout, 'ok');
    const [command, args] = spawn.mock.calls[0].arguments;
    assert.equal(command, 'docker');
    assert.ok(args.includes('--interactive'));
    assert.ok(!args.includes('--mount'));
    assert.ok(args.includes('--read-only'));
    assert.ok(args.includes('1000:1000'));
    assert.deepEqual(JSON.parse(child.stdin.end.mock.calls[0].arguments[0]), {
      sourceCode: payload.sourceCode,
      stdin: payload.stdin,
    });
  });

  it('preserves UTF-8 characters split across output chunks', async () => {
    child.stdin.end.mock.mockImplementation(() => {
      const encoded = Buffer.from('😀');
      child.stdout.emit('data', encoded.subarray(0, 2));
      child.stdout.emit('data', encoded.subarray(2));
      child.emit('close', 0, null);
    });
    const { result } = await execute({
      sourceCode: '1',
      language: 'javascript',
    });
    assert.equal(result.stdout, '😀');
  });

  it('limits multibyte output by bytes', async () => {
    child.stdin.end.mock.mockImplementation(() => {
      child.stdout.emit('data', Buffer.from('😀😀😀'));
      child.emit('close', 0, null);
    });
    const { result } = await execute({
      sourceCode: '1',
      language: 'javascript',
    });
    assert.equal(result.stdout, '😀😀');
    assert.match(result.stderr, /Output exceeded 8 bytes/);
  });

  it('reports a missing Docker executable without crashing the server', async () => {
    child.stdin.end.mock.mockImplementation(() =>
      child.emit('error', new Error('spawn docker ENOENT'))
    );
    const { result } = await execute({
      sourceCode: '1',
      language: 'javascript',
    });
    assert.equal(result.status, 'worker_error');
  });

  it('rejects unauthenticated execution', async () => {
    const response = await fetch(url, { method: 'POST' });
    assert.equal(response.status, 401);
    assert.equal(spawn.mock.callCount(), 0);
  });
});
