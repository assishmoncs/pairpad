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

// Shared axios config for every Judge0 call
const judge0RequestConfig = (extraHeaders = {}) => ({
  headers: {
    ...extraHeaders,
    'X-RapidAPI-Key': JUDGE0_API_KEY,
    'X-RapidAPI-Host': JUDGE0_RAPIDAPI_HOST,
  },
  params: {
    base64_encoded: false,
    fields: '*',
  },
});

/**
 * Get Judge0 language ID from our internal language name
 */
function getLanguageId(language) {
  return LANGUAGE_MAP[language.toLowerCase()] || LANGUAGE_MAP.javascript;
}

/**
 * Submit code to Judge0 for execution
 * @param {string} sourceCode - The code to execute
 * @param {string} language - Language name (javascript, python, etc.)
 * @param {string} stdin - Optional stdin input
 * @returns {Promise<object>} - Execution result
 */
async function submitCode(sourceCode, language, stdin = '') {
  if (!JUDGE0_API_KEY) {
    throw new Error('Judge0 API key not configured. Set JUDGE0_API_KEY in environment.');
  }

  const languageId = getLanguageId(language);

  try {
    // Submit the code for execution
    const submitResponse = await axios.post(
      `${JUDGE0_BASE_URL}/submissions`,
      {
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin || '',
        wait: false, // Don't wait, we'll poll for results
      },
      judge0RequestConfig({ 'Content-Type': 'application/json' })
    );

    const submissionToken = submitResponse.data.token;

    // Poll for results (Judge0 is async)
    return await pollForResult(submissionToken);
  } catch (error) {
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
