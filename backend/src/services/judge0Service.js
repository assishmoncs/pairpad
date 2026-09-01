// Judge0 service for code execution.
// Calls Judge0 CE API (self-hosted or RapidAPI) to execute code safely.
//
// SECURITY NOTE: the Judge0 path executes user code inside Judge0's isolated
// runner. The local fallback (executeLocally) runs user code on THIS host, so
// it is strictly gated: it is disabled in production unless ALLOW_LOCAL_EXECUTION
// is explicitly 'true', and even then it runs in a scrubbed environment with
// resource limits. In production prefer a fully isolated runner (container /
// Judge0) and leave ALLOW_LOCAL_EXECUTION unset.

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const logger = require('../utils/logger');

const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL || 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;
const JUDGE0_RAPIDAPI_HOST = process.env.JUDGE0_RAPIDAPI_HOST || 'judge0-ce.p.rapidapi.com';

const EXEC_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB
const MAX_HEAP_MB = 128;

// Language ID mapping for Judge0
// See: https://judge0.com/docs/
const LANGUAGE_MAP = {
  javascript: 63,      // JavaScript (Node.js 12.14.0)
  python: 71,          // Python (3.8.1)
  python3: 71,
  cpp: 54,             // C++ (GCC 9.2.0)
  cplusplus: 54,
  c: 50,               // C (GCC 9.2.0)
  java: 62,             // Java (OpenJDK 13.0.1)
  go: 60,               // Go (1.13.5)
  rust: 73,             // Rust (1.40.0)
  php: 68,              // PHP (8.2.3)
  ruby: 72,             // Ruby (2.7.0)
  typescript: 74,      // TypeScript (5.0.3)
};

const hasJudge0Key = () => JUDGE0_API_KEY && !JUDGE0_API_KEY.startsWith('replace-with');

/**
 * Whether the unsandboxed local runner may be used.
 * Dev environments default to allowed (no key => local fallback). Production
 * requires an explicit opt-in, because local execution is NOT a security
 * boundary and must only run where the host is disposable/isolated.
 */
const isLocalExecutionAllowed = () => {
  if (process.env.ALLOW_LOCAL_EXECUTION === 'false') return false;
  if (process.env.NODE_ENV === 'production') {
    return process.env.ALLOW_LOCAL_EXECUTION === 'true';
  }
  return true;
};

// Log a warning at module load when local execution is allowed.
if (isLocalExecutionAllowed() && process.env.NODE_ENV !== 'test') {
  logger.warn('⚠️  Local code execution is ENABLED. User-submitted code runs on this host without container isolation.');
}

/** Environment for child processes: explicit allowlist, secrets never inherited. */
function buildChildEnv() {
  return {
    PATH: process.env.PATH || (process.platform === 'win32' ? process.env.PATH : '/usr/bin:/bin'),
    HOME: process.env.HOME || os.homedir(),
    TMPDIR: os.tmpdir(),
    TMP: os.tmpdir(),
    TEMP: os.tmpdir(),
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
  };
}

// Shared axios config for every Judge0 call
const judge0RequestConfig = (extraHeaders = {}) => {
  const headers = { ...extraHeaders };
  if (hasJudge0Key()) {
    headers['X-RapidAPI-Key'] = JUDGE0_API_KEY;
    headers['X-RapidAPI-Host'] = JUDGE0_RAPIDAPI_HOST;
  }
  return {
    headers,
    params: {
      base64_encoded: false,
      fields: '*',
    },
  };
};

/**
 * Fallback runner for local execution when Judge0 is unconfigured or unavailable.
 * Supports JavaScript, TypeScript, and Python.
 *
 * Hardening:
 *  - runs in a scrubbed environment (no app secrets inherited),
 *  - caps heap, output buffer, and wall-clock time,
 *  - pipes stdin/stdout/stderr through isolated streams.
 * Note: this is a *resource* guard, NOT a full security sandbox (no container/
 * seccomp/cgroups). Keep it disabled in production (see isLocalExecutionAllowed).
 */
async function executeLocally(sourceCode, language, stdin = '') {
  const lang = (language || '').toLowerCase();

  if (!isLocalExecutionAllowed()) {
    logger.warn('Local code execution blocked by configuration', { language });
    return null;
  }

  const startTime = Date.now();
  const tmpDir = os.tmpdir();
  const filename = `pairpad_exec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let cmd = '';
  let args = [];
  let fileExt;

  if (lang === 'javascript' || lang === 'typescript') {
    cmd = 'node';
    fileExt = '.js';
    args = ['--max-old-space-size=' + MAX_HEAP_MB];
  } else if (lang === 'python' || lang === 'python3') {
    cmd = process.platform === 'win32' ? 'python' : 'python3';
    fileExt = '.py';
  } else {
    return null;
  }

  const filePath = path.join(tmpDir, filename + fileExt);

  let stdout = '';
  let stderr = '';
  let exceededBuffer = false;

  try {
    await fs.promises.writeFile(filePath, sourceCode, 'utf8');
  } catch (err) {
    logger.error('Failed to stage local execution file', { message: err.message });
    return null;
  }

  args = args.concat([filePath]);

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      fs.promises.unlink(filePath).catch(() => {});
      resolve(payload);
    };

    const child = spawn(cmd, args, {
      env: buildChildEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      // Kill if the process does not exit within the timeout.
      timeout: EXEC_TIMEOUT_MS,
      // V8 heap / string resource limits (applies to Node; no-op elsewhere).
      resourceLimits: {
        maxOldGenerationSizeMb: MAX_HEAP_MB,
        maxYoungGenerationSizeMb: 16,
        maxStringLength: MAX_OUTPUT_BYTES,
      },
    });

    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length <= MAX_OUTPUT_BYTES) stdout += chunk;
      else exceededBuffer = true;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length + chunk.length <= MAX_OUTPUT_BYTES) stderr += chunk;
      else exceededBuffer = true;
    });

    child.on('error', (err) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(3);
      finish({
        stdout,
        stderr: stderr || err.message,
        output: stdout,
        status: 'runtime_error',
        statusCode: 8,
        time: `${duration}s`,
        memory: 'N/A',
        exitCode: 1,
        signal: null,
      });
    });

    child.on('timeout', () => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // The child already exited; nothing to do.
      }
    });

    child.on('exit', (code, signal) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(3);

      if (timedOut) {
        return finish({
          stdout,
          stderr: exceededBuffer
            ? `Execution timed out after ${(EXEC_TIMEOUT_MS / 1000).toFixed(3)}s (output exceeded ${MAX_OUTPUT_BYTES} bytes).`
            : `Execution timed out after ${(EXEC_TIMEOUT_MS / 1000).toFixed(3)}s`,
          output: stdout,
          status: 'time_limit_exceeded',
          statusCode: 5,
          time: '5.000s',
          memory: 'N/A',
          exitCode: null,
          signal: 'SIGTERM',
        });
      }

      if (exceededBuffer) {
        const extra = stderr ? `\n${stderr}` : '';
        stderr = `${stderr || ''}Output exceeded ${MAX_OUTPUT_BYTES} bytes.${extra}`.trim();
      }

      if (code === 0) {
        finish({
          stdout,
          stderr,
          output: stdout,
          status: 'success',
          statusCode: 3,
          time: `${duration}s`,
          memory: 'N/A',
          exitCode: 0,
          signal: null,
        });
      } else {
        finish({
          stdout,
          stderr: stderr || `Process exited with code ${code || 1}`,
          output: stdout,
          status: 'runtime_error',
          statusCode: 8,
          time: `${duration}s`,
          memory: 'N/A',
          exitCode: code || 1,
          signal: signal || null,
        });
      }
    });

    if (stdin && child.stdin) {
      child.stdin.write(stdin);
    }
    if (child.stdin) {
      child.stdin.end();
    }
  });
}

/**
 * Get Judge0 language ID from our internal language name.
 * Throws for unsupported languages instead of silently defaulting,
 * so callers surface the invalid input rather than running the wrong runtime.
 */
function getLanguageId(language) {
  if (typeof language !== 'string') {
    throw new Error('Language must be a string.');
  }

  const languageId = LANGUAGE_MAP[language.toLowerCase()];
  if (languageId === undefined) {
    throw new Error(`Unsupported language: ${language}`);
  }

  return languageId;
}

/**
 * Submit code to Judge0 for execution (with local fallback if unconfigured)
 * @param {string} sourceCode - The code to execute
 * @param {string} language - Language name (javascript, python, etc.)
 * @param {string} stdin - Optional stdin input
 * @returns {Promise<object>} - Execution result
 */
async function submitCode(sourceCode, language, stdin = '') {
  const isKeyConfigured = hasJudge0Key();

  // In tests, require a configured key so behavior is deterministic.
  if (process.env.NODE_ENV === 'test' && !isKeyConfigured) {
    throw new Error('Judge0 API key not configured. Set JUDGE0_API_KEY in environment.');
  }

  const languageId = getLanguageId(language);

  if (isKeyConfigured) {
    try {
      const submitResponse = await axios.post(
        `${JUDGE0_BASE_URL}/submissions`,
        {
          source_code: sourceCode,
          language_id: languageId,
          stdin: stdin || '',
          wait: false,
        },
        judge0RequestConfig({ 'Content-Type': 'application/json' })
      );

      const submissionToken = submitResponse.data.token;
      return await pollForResult(submissionToken);
    } catch (error) {
      if (process.env.NODE_ENV === 'test') {
        throw translateJudge0Error(error);
      }

      const fallbackResult = await executeLocally(sourceCode, language, stdin);
      if (fallbackResult) {
        return fallbackResult;
      }

      throw translateJudge0Error(error);
    }
  }

  const fallbackResult = await executeLocally(sourceCode, language, stdin);
  if (fallbackResult) {
    return fallbackResult;
  }

  if (!isLocalExecutionAllowed()) {
    throw new Error('Code execution service not configured and local execution is disabled.');
  }

  throw new Error('Judge0 API key not configured. Set JUDGE0_API_KEY in environment.');
}

/** Translate known Judge0 HTTP errors into user-friendly messages. */
function translateJudge0Error(error) {
  if (error.response) {
    const status = error.response.status;
    if (status === 401 || status === 403) {
      return new Error('Invalid Judge0 API key or unauthorized access.');
    }
    if (status === 429) {
      return new Error('Rate limit exceeded. Please try again later.');
    }
    if (status === 503) {
      return new Error('Judge0 service unavailable. Try again later.');
    }
  }
  if (error.message && error.message.includes('Judge0')) {
    return error;
  }
  return new Error(`Judge0 submission failed: ${error.message}`);
}

/**
 * Poll Judge0 for execution results
 * @param {string} token - Submission token
 * @param {number} maxAttempts - Maximum polling attempts
 * @param {number} delay - Delay between polls in ms
 * @returns {Promise<object>} - Execution result
 */
async function pollForResult(token, maxAttempts = 30, delay = 500) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(
        `${JUDGE0_BASE_URL}/submissions/${token}`,
        judge0RequestConfig()
      );

      const result = response.data;

      // Status: 1=In Queue, 2=Processing, 3=Accepted, 4=Wrong Answer, 5=Time Limit Exceeded, 6=Memory Limit Exceeded, 7=Compilation Error, 8=Runtime Error
      if (result.status && result.status.id >= 3) {
        return formatResult(result);
      }

      // Still processing, wait and retry
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempts++;
    } catch (error) {
      if (error.response?.status === 404) {
        // Result not ready yet
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempts++;
      } else {
        throw new Error(`Failed to fetch execution result: ${error.message}`, { cause: error });
      }
    }
  }

  throw new Error('Execution timed out. The code may be taking too long to run.');
}

/**
 * Format Judge0 result into our standard response format
 */
function formatResult(result) {
  const statusMap = {
    3: 'success',
    4: 'wrong_answer',
    5: 'time_limit_exceeded',
    6: 'memory_limit_exceeded',
    7: 'compilation_error',
    8: 'runtime_error',
    9: 'runtime_error',   // Non-zero exit (NZE)
    10: 'runtime_error',  // Internal error / RTE
    11: 'output_limit_exceeded',
    12: 'memory_limit_exceeded',
    13: 'time_limit_exceeded',
    14: 'exec_format_error',
  };

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || result.compile_output || '',
    output: result.stdout || '', // Alias for convenience
    status: statusMap[result.status?.id] || 'unknown',
    statusCode: result.status?.id,
    time: result.time ? `${parseFloat(result.time).toFixed(3)}s` : null,
    memory: result.memory ? `${Math.round(result.memory)}KB` : null,
    exitCode: result.exit_code,
    signal: result.signal,
  };
}

module.exports = {
  submitCode,
  getLanguageId,
  isLocalExecutionAllowed,
  executeLocally,
  buildChildEnv,
  LANGUAGE_MAP,
};
