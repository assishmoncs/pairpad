const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = Number(process.env.PORT || 7000);
const WORKER_TOKEN = process.env.EXECUTION_WORKER_TOKEN;
const EXECUTION_TIMEOUT_MS = Number(process.env.EXECUTION_TIMEOUT_MS || 5000);
const MAX_OUTPUT_BYTES = Number(process.env.MAX_OUTPUT_BYTES || 1024 * 1024);
const MAX_SOURCE_BYTES = Number(process.env.MAX_SOURCE_BYTES || 512 * 1024);
const MAX_MEMORY = process.env.EXECUTION_MEMORY || '128m';
const MAX_CPUS = process.env.EXECUTION_CPUS || '0.5';
const MAX_PIDS = process.env.EXECUTION_PIDS_LIMIT || '64';
const DOCKER_NETWORK = process.env.EXECUTION_NETWORK || 'none';
const IMAGE = process.env.EXECUTION_IMAGE || 'node:20-alpine';

if (!WORKER_TOKEN) {
  throw new Error('EXECUTION_WORKER_TOKEN is required.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const constantTimeEqual = (left, right) => {
  const a = crypto.createHmac('sha256', 'cte').update(String(left)).digest();
  const b = crypto.createHmac('sha256', 'cte').update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
};

const authenticate = (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !constantTimeEqual(token, WORKER_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized worker request.' });
  }
  return next();
};

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'pairpad-execution-worker' }));

const appendBounded = (state, chunk) => {
  const text = chunk.toString('utf8');
  if (state.value.length + text.length <= MAX_OUTPUT_BYTES) {
    state.value += text;
    return false;
  }
  state.value = (state.value + text).slice(0, MAX_OUTPUT_BYTES);
  return true;
};

const runDocker = ({ sourceCode, stdin }) => new Promise((resolve) => {
  const jobId = `pairpad-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const hostDir = fs.mkdtempSync(path.join(os.tmpdir(), `${jobId}-`));
  const sourcePath = path.join(hostDir, 'main.js');

  fs.writeFileSync(sourcePath, sourceCode, { encoding: 'utf8', mode: 0o400 });

  const args = [
    'run', '--rm', '--name', jobId,
    '--network', DOCKER_NETWORK,
    '--memory', MAX_MEMORY,
    '--cpus', MAX_CPUS,
    '--pids-limit', MAX_PIDS,
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
    '--user', '1000:1000',
    '--workdir', '/workspace',
    '--mount', `type=bind,src=${hostDir},dst=/workspace,readonly`,
    IMAGE,
    'node', '/workspace/main.js',
  ];

  const stdout = { value: '' };
  const stderr = { value: '' };
  let overflow = false;
  let settled = false;
  const start = Date.now();

  const cleanup = async () => {
    try { await fs.promises.rm(hostDir, { recursive: true, force: true }); } catch {}
  };

  const finish = async (payload) => {
    if (settled) return;
    settled = true;
    await cleanup();
    resolve(payload);
  };

  const child = spawn('docker', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH || '/usr/bin:/bin' },
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try { spawn('docker', ['kill', jobId]); } catch {}
    try { child.kill('SIGKILL'); } catch {}
  }, EXECUTION_TIMEOUT_MS);

  child.stdout.on('data', (chunk) => {
    overflow = appendBounded(stdout, chunk) || overflow;
  });
  child.stderr.on('data', (chunk) => {
    overflow = appendBounded(stderr, chunk) || overflow;
  });

  child.on('error', async (error) => {
    clearTimeout(timeout);
    await finish({
      stdout: stdout.value,
      stderr: error.message,
      output: stdout.value,
      status: 'worker_error',
      statusCode: 500, // HTTP style
      time: `${((Date.now() - start) / 1000).toFixed(3)}s`,
      exitCode: 1,
      signal: null,
    });
  });

  child.on('close', async (code, signal) => {
    clearTimeout(timeout);
    const isTimeout = timedOut || (Date.now() - start >= EXECUTION_TIMEOUT_MS);
    const outputError = overflow ? `Output exceeded ${MAX_OUTPUT_BYTES} bytes.` : '';
    await finish({
      stdout: stdout.value,
      stderr: [stderr.value, outputError].filter(Boolean).join('\n'),
      output: stdout.value,
      status: isTimeout ? 'time_limit_exceeded' : code === 0 ? 'success' : 'runtime_error',
      // statusCode is Judge0 compatible
      statusCode: isTimeout ? 5 : code === 0 ? 3 : 8,
      time: `${(Math.min(Date.now() - start, EXECUTION_TIMEOUT_MS) / 1000).toFixed(3)}s`,
      exitCode: code,
      signal: signal || (isTimeout ? 'SIGKILL' : null),
    });
  });

  if (stdin) child.stdin.write(stdin);
  child.stdin.end();
});

app.post('/execute', authenticate, async (req, res) => {
  const start = Date.now();
  try {
    const { sourceCode, language, stdin = '' } = req.body || {};
    if (language !== 'javascript') {
      return res.status(400).json({ error: 'The isolated worker currently supports JavaScript only.' });
    }
    if (typeof sourceCode !== 'string') return res.status(400).json({ error: 'sourceCode must be a string.' });
    if (Buffer.byteLength(sourceCode, 'utf8') > MAX_SOURCE_BYTES) return res.status(400).json({ error: 'Source code is too large.' });
    if (typeof stdin !== 'string' || Buffer.byteLength(stdin, 'utf8') > MAX_OUTPUT_BYTES) return res.status(400).json({ error: 'stdin is invalid or too large.' });

    const result = await runDocker({ sourceCode, stdin });
    console.log(`[Execute] ${language} - ${Buffer.byteLength(sourceCode, 'utf8')} bytes - ${result.status} - ${result.time}`);
    return res.json({ result });
  } catch (error) {
    console.error(`[Execute] Error: ${error.message}`);
    return res.status(500).json({ error: 'Execution worker failed.' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`PairPad execution worker listening on ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully.');
  server.close(() => process.exit(0));
});
