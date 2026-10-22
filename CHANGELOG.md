# Changelog

All notable changes to PairPad are documented here.

## Unreleased

### Collaboration and product

- Added conflict-free sequence CRDT collaboration with per-file document state and iterative traversal for deep documents.
- Added remote Monaco cursors and selections with presence cleanup and deterministic collaborator styling.
- Added owner/editor/viewer RBAC enforced by REST and Socket.IO.
- Added persistent revision history, comparisons, checkpoints, and owner-only restore across legacy and multi-file workspaces.
- Added multi-file workspaces with safe paths, language detection, file lifecycle controls, and per-file CRDT state.
- Added Interview Mode with lifecycle controls, candidate assignment, public/hidden tests, server-side timing, and hidden-result redaction.
- Added connection recovery states, focus mode, keyboard shortcuts, responsive workspace behavior, and accessibility foundations.

### Security and resilience

- Added rotating refresh-token sessions with HttpOnly cookies, session families, reuse detection, malformed cookie safety, and logout-all support.
- Added isolated execution-worker integration for JavaScript with resource limits, stdin EPIPE guards, and production safeguards.
- Added Redis-backed Socket.IO scaling and distributed presence/document state with immediate initial state synchronization.
- Added structured request logging, correlation IDs, liveness/readiness probes, and constant-time protected Prometheus-compatible metrics.
- Added adversarial authorization and security test coverage.

### API and developer experience

- Added a consolidated authoritative OpenAPI 3.1 contract at `docs/openapi.yaml` and bundled runtime copy for container deployments.
- Added runtime OpenAPI and API documentation endpoints.
- Added Docker Compose production/development foundation.
- Added Playwright browser testing and automated accessibility checks.
- Added API performance and frontend bundle-size budgets.
- Added comprehensive quality, deployment, security, scaling, execution, database, workspace, interview, UX, and accessibility runbooks.

### CI/CD and release engineering

- Added GitHub Actions quality, CodeQL, Dependabot, performance, E2E, and accessibility gates using reproducible `npm ci` builds.
- Added tagged container release workflow for backend, frontend, and execution-worker images.
- Added immutable image tagging, release provenance artifacts, promotion guidance, and rollback runbook.
- Added CI concurrency controls and job timeouts.
