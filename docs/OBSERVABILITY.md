# PairPad Observability

PairPad has a dependency-free operational metrics baseline intended for local diagnostics, CI smoke checks, and production metric scraping.

## Health endpoints

- `GET /health` is the liveness probe. It should answer quickly without requiring MongoDB.
- `GET /ready` is the readiness probe. It reports MongoDB state and, when required, Redis state.
- `GET /metrics` exposes Prometheus-compatible HTTP metrics.

## Metrics endpoint security

Set `METRICS_TOKEN` in production. Without a matching `X-Metrics-Token` header or `Authorization: Bearer <token>`, production returns `404` to avoid advertising the operational endpoint.

Do not reuse `JWT_SECRET`, database credentials, or execution-worker credentials as the metrics token.

## Metrics currently exposed

- `pairpad_uptime_seconds`
- `pairpad_http_requests_in_flight`
- `pairpad_http_requests_completed_total`
- `pairpad_http_request_duration_average_ms`
- `pairpad_http_requests_total`
- `pairpad_http_requests_total{method="..."}`
- `pairpad_http_requests_total{status_class="2xx|3xx|4xx|5xx|other"}`

The metrics are process-local. They reset when a backend process restarts and are not a substitute for a persistent time-series backend.

## Operational guidance

Track p95/p99 latency, request error rates, process restarts, MongoDB latency, Redis health, Socket.IO disconnect/reconnect rates, and execution-worker failures in the external monitoring platform. The built-in endpoint is deliberately small and avoids adding a runtime telemetry dependency to the application.

For load testing, run traffic against a non-production environment, export the metrics endpoint during the test, and compare latency/error counters before and after changes.
