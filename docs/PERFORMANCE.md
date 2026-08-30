# PairPad Performance Gates

PairPad treats performance as a release-quality constraint rather than an afterthought.

## API budget

`backend/scripts/performance-budget.js` runs dependency-free concurrent requests against `/health` and `/ready`.

Default CI budget:

- 120 requests per endpoint
- 12 concurrent requests
- p95 latency <= 250 ms
- error rate = 0%

Local configuration:

```bash
PAIRPAD_BASE_URL=http://127.0.0.1:5000 \
PERF_REQUESTS=300 \
PERF_CONCURRENCY=25 \
PERF_P95_MS=300 \
npm run perf
```

These are smoke/load budgets, not capacity claims. Production capacity still requires environment-specific load testing.

## Frontend bundle budget

`frontend/scripts/check-build-budget.mjs` checks the production `dist/assets` output after `vite build`.

Default budgets:

- Total uncompressed JavaScript <= 2.5 MB
- Largest uncompressed JavaScript asset <= 1.0 MB

Override with `PERF_JS_TOTAL_BYTES` and `PERF_JS_MAX_BYTES` when a measured architecture change justifies a different budget.

## CI gate

The `performance` GitHub Actions job runs after backend and frontend quality jobs. It starts MongoDB and Redis, boots the backend, runs the API budget, builds the frontend, and runs the bundle budget. Logs are uploaded as artifacts on every run.

## Profiling guidance

When a budget fails:

1. Inspect the uploaded backend log and performance JSON output.
2. Check whether the regression is CPU, database, network, or bundle related.
3. Fix the underlying code or explicitly revise the measured budget with justification.
4. Never weaken the gate just to make CI green.
