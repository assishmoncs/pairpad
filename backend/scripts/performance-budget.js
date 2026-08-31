const { performance } = require('node:perf_hooks');

const BASE_URL = (process.env.PAIRPAD_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const REQUESTS = Math.max(1, Number(process.env.PERF_REQUESTS || 120));
const CONCURRENCY = Math.max(1, Number(process.env.PERF_CONCURRENCY || 12));
const P95_BUDGET_MS = Math.max(1, Number(process.env.PERF_P95_MS || 250));
const ERROR_RATE_BUDGET = Math.max(0, Number(process.env.PERF_ERROR_RATE || 0));

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const rank = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, rank)];
};

async function timedGet(path) {
  const started = performance.now();
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    const durationMs = performance.now() - started;
    return { ok: response.ok, status: response.status, durationMs };
  } catch (error) {
    return { ok: false, status: 0, durationMs: performance.now() - started, error: error.message };
  }
}

async function runScenario(path) {
  const results = [];
  let next = 0;

  const worker = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= REQUESTS) return;
      results[index] = await timedGet(path);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, REQUESTS) }, worker));

  const failures = results.filter((result) => !result.ok);
  const durations = results.map((result) => result.durationMs);
  const summary = {
    path,
    requests: REQUESTS,
    concurrency: CONCURRENCY,
    failures: failures.length,
    errorRate: Number((failures.length / REQUESTS).toFixed(4)),
    p50Ms: Number(percentile(durations, 50).toFixed(2)),
    p95Ms: Number(percentile(durations, 95).toFixed(2)),
    p99Ms: Number(percentile(durations, 99).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
  };

  console.log(JSON.stringify(summary));

  if (summary.errorRate > ERROR_RATE_BUDGET || summary.p95Ms > P95_BUDGET_MS) {
    throw new Error(`Performance budget exceeded for ${path}: p95=${summary.p95Ms}ms, errorRate=${summary.errorRate}`);
  }

  return summary;
}

(async () => {
  await runScenario('/health');
  await runScenario('/ready');
})();
