# PairPad 10/10 Quality Baseline

This document defines the acceptance gates for the PairPad hardening roadmap. The goal is not to maximize feature count; it is to make the existing product reliable, secure, testable, scalable, and easy to deploy.

## Engineering gates

- Backend lint: zero errors.
- Frontend lint: zero errors.
- Formatting checks: zero diffs.
- Production builds: successful on a clean checkout.
- No committed secrets or generated credentials.
- No critical/high dependency vulnerabilities without a documented exception.
- REST surface is represented by an authoritative OpenAPI 3.1 contract.

## Test gates

- Backend coverage target: >= 85% statements/branches/functions/lines where practical.
- Frontend coverage target: >= 90% on application code where practical.
- Critical REST flows covered by integration tests.
- Critical Socket.IO flows covered by integration tests.
- OpenAPI contract tests cover critical paths and implementation limits.
- End-to-end happy path covered in two independent browser sessions.
- Reconnect, concurrent editing, authorization, revision restore, and room lifecycle cases covered.

## Security gates

- Strong production JWT secret required at startup.
- Production local execution disabled by default.
- Untrusted code executes only inside an isolated worker/sandbox in production.
- Authentication, authorization and rate limiting enforced server-side.
- Secrets never returned to clients or inherited by execution workers.
- Security headers and explicit CORS allowlist enabled.
- Security scanning runs in CI.

## Collaboration gates

- Concurrent edits must not silently overwrite another user's changes.
- Remote cursor/selection state must be isolated from document state.
- Reconnect must restore room membership and collaboration state.
- Presence must work correctly across multiple backend instances.
- A document restore must replace both persisted and in-memory collaboration state and notify connected clients.

## Revision-history gates

- Revisions are immutable checkpoints with room, author, language, source and timestamp metadata.
- Automatic checkpoints are throttled and do not create a database write for every keystroke.
- Members can browse history and compare revisions.
- Editors can create manual checkpoints.
- Only owners can restore revisions.
- Restoring a revision creates a new restore checkpoint for auditability.

## API gates

- OpenAPI 3.1 contract is checked into `docs/openapi.yaml`.
- Runtime contract is available at `/api/openapi.yaml`.
- Human-readable API landing page is available at `/api/docs`.
- Endpoint changes update implementation and contract in the same change.
- The OpenAPI document is documentation; server-side validation and authorization remain authoritative.

## Deployment gates

- A clean environment can start the stack reproducibly.
- Docker images build without manual source changes.
- Health and readiness probes are available.
- Production configuration is documented.
- Failed deployments can be detected and rolled back.

## Product gates

- Core flow is usable without reading the source code.
- User-facing errors are actionable.
- Loading, reconnecting and empty states are explicit.
- Keyboard navigation and accessible form feedback are supported.
- README setup instructions are verified from a clean checkout.

## Final acceptance flow

Register -> create room -> second user joins -> concurrent edit -> remote cursor -> chat -> run code -> create revision -> compare history -> restore revision -> disconnect -> reconnect -> verify permissions -> restart backend -> verify persistence -> validate OpenAPI contract -> run E2E/security suites -> build/deploy through CI.
