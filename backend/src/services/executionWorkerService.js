const axios = require('axios');

const WORKER_URL = (process.env.EXECUTION_WORKER_URL || '').replace(/\/$/, '');
const WORKER_TOKEN = process.env.EXECUTION_WORKER_TOKEN || '';
const WORKER_TIMEOUT_MS = Number(process.env.EXECUTION_WORKER_TIMEOUT_MS || 7000);

const isWorkerConfigured = () => Boolean(WORKER_URL && WORKER_TOKEN);

const executeInWorker = async ({ sourceCode, language, stdin = '' }) => {
  if (!isWorkerConfigured()) return null;

  const response = await axios.post(
    `${WORKER_URL}/execute`,
    { sourceCode, language, stdin },
    {
      timeout: WORKER_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${WORKER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      validateStatus: (status) => status >= 200 && status < 500,
    }
  );

  if (response.status >= 400) {
    throw new Error(response.data?.error || 'Execution worker rejected the request.');
  }

  return response.data?.result || null;
};

module.exports = { isWorkerConfigured, executeInWorker };
