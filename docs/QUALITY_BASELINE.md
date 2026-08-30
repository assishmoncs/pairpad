# PairPad 10/10 Quality Baseline

This document defines the acceptance gates for the PairPad hardening roadmap. The goal is not to maximize feature count; it is to make the existing product reliable, secure, testable, scalable, accessible, observable, performant, and easy to deploy.

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
- Workspace UX components, path validation, and file model constraints have focused tests.
- Interview lifecycle, authorization, timeout, and hidden-test isolation have focused tests.
- Adversarial API tests cover unauthorized room access, viewer execution, malformed identifiers, oversized payloads, and ownership boundaries.
- Browser E2E covers two independent sessions sharing a room and editing the same workspace file.
- Browser E2E failures retain screenshots, video and traces in CI.
- Reconnect, concurrent editing, authorization, revision restore, room lifecycle, workspace switching, and interview lifecycle cases covered.
- Automated browser accessibility gates cover public pages, accessible names, form labels, image alternatives, tab order, and visible keyboard focus.

## Security gates

- Strong production JWT secret required at startup.
- Production local execution disabled by default.
- Untrusted code executes only inside an isolated worker/sandbox in production.
- Authentication, authorization and rate limiting enforced server-side.
- Secrets never returned to clients or inherited by execution workers.
- Security headers and explicit CORS allowlist enabled.
- Hidden interview test inputs/expected outputs never exposed to candidates.
- Candidate assignment and interview timeout enforced server-side.
- Workspace paths reject traversal and unsafe path components.
- Adversarial API/security suites run in CI with MongoDB and Redis.
- Security scanning runs in CI.

## Collaboration gates

- Concurrent edits must not silently overwrite another user's changes.
- Remote cursor/selection state must be isolated from document state.
- Each workspace file has an independent CRDT document key.
- Switching files cannot reuse another file's CRDT state.
- Reconnect must restore room membership and collaboration state.
- Presence must work correctly across multiple backend instances.
- A document restore must replace both persisted and in-memory collaboration state and notify connected clients.

## Workspace gates

- Every room exposes a persisted file tree.
- Existing single-file rooms migrate lazily to a default `main.<extension>` file.
- Owners/editors can create, rename, and delete files.
- At least one file must always remain in a workspace.
- File language is inferred from supported extensions when not explicitly supplied.
- File content and CRDT state limits are enforced server-side.
- Workspace file changes propagate to connected clients.
- Execution targets the currently active file and its language.

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
- Workspace and Interview endpoint details have checked-in API fragments until consolidated into the main contract.
- Endpoint changes update implementation and contract documentation in the same change.
- The OpenAPI document is documentation; server-side validation and authorization remain authoritative.

## Interview gates

- Owner can create and edit an interview only while it is not active.
- Interview lifecycle supports draft, running, paused, resumed, and ended states.
- Only the owner can control lifecycle state.
- Candidate assignment, when configured, is enforced server-side.
- Countdown time is enforced server-side, not only by the browser.
- Public test inputs/expected outputs are visible to candidates.
- Hidden test inputs/expected outputs remain private.
- Candidate results expose hidden pass/fail metadata without revealing hidden case contents.
- Interview submissions use the same execution isolation and limits as normal execution.

## Performance gates

- API performance smoke budget: <= 250 ms p95 for `/health` and `/ready` under the default CI load profile.
- Default API performance profile: 120 requests per endpoint, 12 concurrent requests, 0% tolerated errors.
- Frontend production JavaScript budget: <= 2.5 MB total uncompressed JS.
- Largest frontend JavaScript asset budget: <= 1.0 MB uncompressed.
- Performance gates must run in CI after functional backend/frontend quality gates.
- A budget change requires documented justification rather than silently weakening the check.

## Observability gates

- Every HTTP request receives a correlation/request ID.
- Structured logs are available for production ingestion.
- `/metrics` exposes machine-readable request metrics and is protected in production.
- Health/readiness probes distinguish liveness from dependency readiness.
- Performance and E2E failures retain actionable CI artifacts.

## Accessibility gates

- Public pages pass the automated Playwright accessibility checks.
- Interactive controls expose accessible names.
- Form fields have explicit or programmatic labels.
- Images provide alternative text when rendered.
- Positive `tabindex` values are prohibited.
- Primary controls expose visible keyboard focus.
- Skip navigation is available and route changes move focus to main content.
- `prefers-reduced-motion` is respected.
- Manual WCAG 2.2 AA review is required for screen readers, contrast, zoom/reflow, and the Monaco editing surface before production release.

## Deployment gates

- A clean environment can start the stack reproducibly.
- Docker images build without manual source changes.
- Health and readiness probes are available.
- Production configuration is documented.
- Failed deployments can be detected and rolled back.

## Product and UX gates

- Core flow is usable without reading the source code.
- User-facing errors are actionable.
- Loading, reconnecting and empty states are explicit.
- Connection interruptions expose understandable recovery actions.
- Keyboard shortcuts are discoverable and do not interfere with normal text input.
- Keyboard focus is visibly indicated.
- Reduced-motion preferences are respected.
- The room layout remains usable on narrow screens.
- Viewers cannot edit or execute code.
- File switching preserves the selected document and language.
- README setup instructions are verified from a clean checkout.

## Final acceptance flow

Register -> create room -> second user joins -> open workspace -> create second file -> switch files -> concurrent edit same file -> switch back -> verify isolation -> remote cursor -> chat -> run active file -> create revision -> compare history -> restore revision -> disconnect -> reconnect -> verify permissions -> start interview -> candidate submits -> hidden tests stay private -> pause/resume/end interview -> restart backend -> verify persistence -> validate OpenAPI contract -> exercise workspace shortcuts and responsive states -> run performance, accessibility, E2E, and security suites -> build/deploy through CI.
