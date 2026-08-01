// Judge0 service for code execution
// Calls Judge0 CE API (self-hosted or RapidAPI) to execute code safely

const axios = require('axios');

const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL || 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;
const JUDGE0_RAPIDAPI_HOST = process.env.JUDGE0_RAPIDAPI_HOST || 'judge0-ce.p.rapidapi.com';

// Language ID mapping for Judge0
// See: https://judge0.com/docs/
const LANGUAGE_MAP = {
  javascript: 63,      // JavaScript (Node.js 12.14.0)
  python: 71,          // Python (3.8.1)
  python3: 71,
  cpp: 54,             // C++ (GCC 9.2.0)
  cplusplus: 54,
  c: 50,               // C (GCC 9.2.0)
  java: 62,            // Java (OpenJDK 13.0.1)
  go: 60,              // Go (1.13.5)
  rust: 73,            // Rust (1.40.0)
  php: 68,             // PHP (8.2.3)
  ruby: 72,            // Ruby (2.7.0)
  typescript: 74,      // TypeScript (5.0.3)
};

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// Shared axios config for every Judge0 call
const judge0RequestConfig = (extraHeaders = {}) => {
  const headers = { ...extraHeaders };
  if (JUDGE0_API_KEY && !JUDGE0_API_KEY.startsWith('replace-with')) {
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
 */
async function executeLocally(sourceCode, language, stdin = '') {
  const lang = (language || '').toLowerCase();
  const startTime = Date.now();
  const tmpDir = os.tmpdir();
  const filename = `pairpad_exec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let cmd = '';
  let args = [];
  let fileExt = '.txt';

  if (lang === 'javascript' || lang === 'typescript') {
    cmd = 'node';
    fileExt = '.js';
  } else if (lang === 'python' || lang === 'python3') {
    cmd = process.platform === 'win32' ? 'python' : 'python3';
    fileExt = '.py';
  } else {
    return null;
  }

  const filePath = path.join(tmpDir, filename + fileExt);

  try {
    await fs.promises.writeFile(filePath, sourceCode, 'utf8');
    args = [filePath];
  } catch (err) {
    return null;
  }

  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      },
      async (error, stdout, stderr) => {
        try {
          await fs.promises.unlink(filePath);
        } catch (_) {}

        const duration = ((Date.now() - startTime) / 1000).toFixed(3);

        if (error && error.killed) {
          return resolve({
            stdout: stdout || '',
            stderr: 'Execution timed out after 5.000s',
            output: stdout || '',
            status: 'time_limit_exceeded',
            statusCode: 5,
            time: '5.000s',
            memory: 'N/A',
            exitCode: null,
            signal: 'SIGTERM',
          });
        }

        const isError = !!error;
        resolve({
          stdout: stdout || '',
          stderr: stderr || (isError ? error.message : ''),
          output: stdout || '',
          status: isError ? 'runtime_error' : 'success',
          statusCode: isError ? 8 : 3,
          time: `${duration}s`,
          memory: 'N/A',
          exitCode: error ? error.code || 1 : 0,
          signal: null,
        });
      }
    );

    if (stdin && child.stdin) {
      child.stdin.write(stdin);
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
  const isKeyConfigured = JUDGE0_API_KEY && !JUDGE0_API_KEY.startsWith('replace-with');

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
        if (error.response) {
          const status = error.response.status;
          if (status === 401 || status === 403) {
            throw new Error('Invalid Judge0 API key or unauthorized access.');
          } else if (status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
          } else if (status === 503) {
            throw new Error('Judge0 service unavailable. Try again later.');
          }
        }
        throw new Error(`Judge0 submission failed: ${error.message}`);
      }

      const fallbackResult = await executeLocally(sourceCode, language, stdin);
      if (fallbackResult) {
        return fallbackResult;
      }

      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          throw new Error('Invalid Judge0 API key or unauthorized access.');
        } else if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (status === 503) {
          throw new Error('Judge0 service unavailable. Try again later.');
        }
      }
      throw new Error(`Judge0 submission failed: ${error.message}`);
    }
  }

  const fallbackResult = await executeLocally(sourceCode, language, stdin);
  if (fallbackResult) {
    return fallbackResult;
  }

  throw new Error('Judge0 API key not configured. Set JUDGE0_API_KEY in environment.');
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
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    } catch (error) {
      if (error.response?.status === 404) {
        // Result not ready yet
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
      } else {
        throw new Error(`Failed to fetch execution result: ${error.message}`);
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
    9: 'runtime_error', // NZE
    10: 'compile_error', // RTE
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
  LANGUAGE_MAP,
};
