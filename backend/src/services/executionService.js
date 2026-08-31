const judge0Service = require('./judge0Service');
const { isWorkerConfigured, executeInWorker } = require('./executionWorkerService');

const ISOLATED_LANGUAGES = new Set(['javascript']);

const executeCode = async (sourceCode, language, stdin = '') => {
  const normalized = String(language || '').toLowerCase();

  if (isWorkerConfigured() && ISOLATED_LANGUAGES.has(normalized)) {
    const workerResult = await executeInWorker({ sourceCode, language: normalized, stdin });
    if (workerResult) return workerResult;
  }

  return judge0Service.submitCode(sourceCode, normalized, stdin);
};

module.exports = { executeCode, ISOLATED_LANGUAGES };
