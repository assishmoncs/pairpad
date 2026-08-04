# PairPad — Architectural & Security Audit + Upgrade Roadmap

**Scope:** Full-stack monorepo (`backend/` Node.js + Express + Socket.IO + MongoDB, `frontend/` React 18 + Vite + Monaco).
**Auditor role:** Lead Software Architect & Senior Code Security Auditor.
**Method:** Static source review, dependency/security scan, and **executed** test & build verification on the exact revision `1f16701` (branch `arena/019fcdcb-pairpad`).
**Date:** 2026-08-04

---

## 0. Verification Summary (what was actually executed)

| Check | Command | Result |
|-------|---------|--------|
| Backend test suite | `npm test` (backend) | ✅ **195/195 passed, 15/15 suites** — matches README |
| Backend coverage | Jest coverage report | ~**81.2%** stmts / 81.1% lines (services 54.7%, models 65.5%) |
| Frontend test suite | `npm test` (frontend, Vitest) | ✅ **13/13 passed, 3/3 files** (README claims 11 — drift) |
| Frontend production build | `npm run build` (frontend) | ✅ builds in ~1.7s (bundle 291 kB / 95.8 kB gzip) |
| Dependency vulnerabilities | `npm audit` (backend prod) | ✅ **0 known vulnerabilities** |
| Linting / CI | search for ESLint/Prettier/GitHub Actions | ❌ **None present** |

Verified findings are grounded in the real code, not just the README.

---

## 1. Quantitative & Qualitative Assessment

Scores are 1–10 (10 = production-excellent). Weighted toward the most severe limiting factor where applicable.

| Dimension | Score | Short Justification |
|-----------|:-----:|---------------------|
| **Code Architecture** | **7 / 10** | Clean layered MVC (routes → controllers → services → models), shared utils, a well-factored `SocketService` singleton and consistent response envelope. Pulled down by a 698-line monolithic `Room.jsx`, hand-rolled validation in controllers instead of a middleware/schema layer, duplicate try/catch boilerplate across every controller, inline handler in `messageRoutes.js`, no service layer for room business logic, and no TypeScript/monorepo workspaces. |
| **Security** | **3 / 10** | **Critical RCE:** the "local fallback" code runner (`judge0Service.executeLocally`) executes arbitrary user-supplied Node/Python as the server process user with **no OS sandbox** — full filesystem/env access (`JWT_SECRET`, `MONGODB_URI`, `JUDGE0_API_KEY`) and outbound network. Compounded by open registration, 6-char guessable room codes, permissive auto-join, JWT in `localStorage` with CSP disabled, token in socket query string, weak password policy, and unused rate limiters. Positives: bcrypt, helmet, CORS allowlist, input validation, 0 npm vulns. |
| **Performance** | **5 / 10** | Every keystroke triggers a MongoDB write (`Room.updateOne` snapshot) **and** a full-document Socket.IO broadcast — no debounce/batching. Judge0 polling (up to 30×500ms = ~15s) blocks the HTTP request synchronously. Presence is in-memory (no horizontal scaling). No `.lean()` on reads, no pagination on room list. Adequate for MVP concurrency, not for production load. |
| **Resilience / Error Handling** | **6 / 10** | Good bones: centralized `errorHandler`, `ApiError`, graceful shutdown, `uncaughtException`/`unhandledRejection` handlers, socket auto-reconnect with back-off, and an "auth unavailable" retry state in the frontend. Gaps: fire-and-forget snapshot writes swallow errors, no circuit breaker/backoff for Judge0, DB connect is single-shot, `socketLimiter`/`validateLanguage`/`validateChatMessage` are **defined but never used**, and console-only logging with no request IDs or error tracking. |
| **Test Coverage** | **6 / 10** | Backend is genuinely strong (195 tests, ~81% coverage; controllers 95%, sockets 96%, middleware 100%). Frontend is weak: **13 tests across only 3 files** — `AuthContext`, `SocketService`, hooks, components, and the chat/execution flows are untested. No E2E tests, no CI gate, no coverage thresholds enforced. |
| **Documentation** | **7 / 10** | Excellent README (features, quickstart, env table, API reference, Socket.IO event table, structure, roadmap) plus a solid `docs/system-design.md`. Pulled down by drift (frontend test count "11" vs actual 13; local runner described as "sandboxed" when it is not), and missing deployment guide, error-code catalog, auth-flow doc, and Docker instructions. |

> **Overall health:** a well-structured, thoughtfully written **MVP** with a strong test discipline on the backend, but it must **not be deployed publicly as-is** until the code-execution sandbox and auth-storage issues are remediated (Phase 1).

---

## 2. Defect & Issue Inventory

### P0 — Critical (bugs, security risks, breaking logic)

| ID | Issue | Location | Impact / Rationale |
|----|-------|----------|--------------------|
| **P0-1** | **Remote code execution (RCE) via local execution fallback.** `executeLocally()` writes user code to disk and runs `node`/`python` with `execFile` under the server's OS user — no chroot, container, cgroup, seccomp, network kill, or env scrubbing. | `backend/src/services/judge0Service.js` | Any authenticated user (registration is open) can run arbitrary code with the app's privileges: read `JWT_SECRET`, `MONGODB_URI`, `JUDGE0_API_KEY`, exfiltrate data, or pivot into the network. The 5s timeout and 1MB buffer cap **do not** constrain CPU, memory, or side-effects. **This is a full host compromise primitive.** |
| **P0-2** | **Weak room-access control doubles as the execute gate.** A room is protected only by a 6-character code from a 36-symbol alphabet (~2.2×10⁹ ≈ brute-forceable) and any authenticated user may `POST /join` with that code and be added. | `backend/src/utils/roomAccess.js`, `roomController.joinRoom` | Combined with P0-1, an attacker who guesses a code gains both room access **and** the execution primitive inside that room. No rate limit on join/socket events (see P1-10). |
| **P0-3** | **JWT stored in `localStorage` with Content-Security-Policy disabled.** | `frontend/src/context/AuthContext.jsx`, `backend/src/server.js` | Any stored-XSS (e.g., a malicious message or code result rendered unsafely) can exfiltrate the bearer token. No httpOnly cookie, no refresh/rotation, no server-side revocation. CSP is explicitly turned off in Helmet config. |
| **P0-4** | **Execution lacks resource limits** (CPU time, memory cap, process count, network egress). A child can fork-bomb, OOM the host, or open sockets — not merely the intended "5s run." | `backend/src/services/judge0Service.js` | Amplifies P0-1 into a DoS vector against the host itself. The README's "sandboxed child process" claim is inaccurate. |

### P1 — Important (refactoring, code smells, missing boundaries, tests)

| ID | Issue | Location | Impact / Rationale |
|----|-------|----------|--------------------|
| **P1-1** | **DB write on every keystroke.** `code-change` → `Room.updateOne` fires per edit with no debounce/batch/dirty tracking. | `backend/src/sockets/socketHandler.js` | Unbounded MongoDB write amplification; a single active editor can saturate writes; scaling bottleneck. |
| **P1-2** | **Full-document broadcast on every keystroke.** Entire `content` string is emitted to the room each change. | `backend/src/sockets/socketHandler.js`, `Room.jsx` | Bandwidth/CPU waste at multi-user scale; no diffs, no throttling, no offline coalescing. |
| **P1-3** | **`Room.jsx` is a 698-line monolith** mixing data-fetching, socket lifecycle, editor control, chat, execution, and 15+ state slices. | `frontend/src/pages/Room.jsx` | Hard to test/reason about; every new feature increases cognitive load; duplicates logic that belongs in hooks/components. |
| **P1-4** | **Unused/misapplied utilities.** `socketLimiter`, `validateLanguage`, `validateChatMessage` are exported but never imported/used. Socket events (join, code-change, chat) are **not rate-limited** server-side. | `backend/src/middleware/rateLimiter.js`, `utils/validation.js`, `sockets/socketHandler.js` | Dead code plus a real abuse gap: an authenticated client can flood code-change/chat/cursor events per socket. |
| **P1-5** | **Chat max-length inconsistency.** `validateChatMessage` allows 2000 chars; the socket handler truncates to 1000 and the `Message` model caps at 1000. | `backend/src/utils/validation.js`, `sockets/socketHandler.js`, `models/Message.js` | Confusing/divergent contracts; validation helper is effectively bypassed by the manual truncate. |
| **P1-6** | **No linting/formatting/CI.** No ESLint, Prettier, editorconfig, or `.github/workflows`. README roadmap lists "CI/CD with lint gates" but none exists. | repo root, `frontend/`, `backend/` | No automated quality or security gates on PRs; inconsistent style; regressions only caught by local `npm test`. |
| **P1-7** | **Duplicated controller try/catch boilerplate + non-uniform error flow.** Every controller catches, logs, and calls `sendError` instead of delegating to the global handler via `next()`/`asyncHandler`. | `backend/src/controllers/*`, `routes/messageRoutes.js` | Inconsistent error semantics, hard to add request IDs/logging centrally, some errors bypass `errorHandler`. |
| **P1-8** | **Synchronous Judge0 polling blocks the request** up to ~15s (30×500ms), holding an HTTP connection and a Node event-loop-adjacent handler. | `backend/src/services/judge0Service.js`, `executeController.js` | Poor latency profile; no queue/async job; request timeouts under load; a single slow submission ties up resources (only capped by `executeLimiter` per IP). |
| **P1-9** | **Frontend test coverage is thin** and misses the highest-risk modules (`AuthContext`, `SocketService`, `useAsyncAction`, components, chat/execution flows). No E2E. | `frontend/src` | Auth/state-machine bugs (e.g., the reconnect/rejoin logic) are exactly what a collaborative app can least afford to ship broken — and they're untested. |
| **P1-10** | **Socket auth token accepted via query string** (`socket.handshake.query.token`) and a **DB lookup per connection**. | `backend/src/sockets/socketHandler.js` | Tokens in query strings leak into proxy/access logs; a per-connection DB query is a scaling cost; prefer a dedicated handshake header + JWT-only verification. |
| **P1-11** | **TOCTOU duplicate-membership race** in `joinRoom` (check-then-push) with no DB-level uniqueness guard. | `backend/src/controllers/roomController.js` | Concurrent join/leave can corrupt the membership array. |
| **P1-12** | **Owner cannot leave or transfer ownership**; the only exit is to delete the room (which destroys chat). | `backend/src/controllers/roomController.js` | Missing ownership-transfer path blocks a common collaboration workflow. |
| **P1-13** | **No pagination on room list** and no `.lean()` on hot read paths. | `roomController.getUserRooms`, `roomAccess.js` | Room count grows unbounded per user; full-document hydration is wasteful. |
| **P1-14** | **Weak password policy** (min length 6 only, no complexity/common-password rejection) and no account-lockout beyond IP rate limiting. | `backend/src/utils/validation.js`, `authController.js` | Auth brute-force protection is thin per-account. |

### P2 — Nice-to-have (non-critical optimization, DX, docs)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| **P2-1** | README says frontend has "11 tests" (actual 13) and describes the local runner as "sandboxed" (it isn't). | `README.md` | Documentation accuracy/drift. |
| **P2-2** | `snapshotCode` persisted but never surfaced as an editable revision history / restore UI. | `Room.jsx`, `Room` model | Untapped feature (roadmap lists history — make it real). |
| **P2-3** | No `/health` readiness distinction (DB up? sockets up?) — only a static `status: ok`. | `backend/src/server.js` | Ops/load-balancer health can't distinguish degraded state. |
| **P2-4** | No Docker Compose / one-command setup, no deployment guide. | repo root | Onboarding to a non-local environment is manual (roadmap lists it). |
| **P2-5** | `AuthContext` mutates `axios.defaults` globally for the token; multi-tab/token conflicts and no axios interceptor for 401 → logout/refresh. | `frontend/src/context/AuthContext.jsx` | Global-side-effect design smell; 401 handling is ad hoc. |
| **P2-6** | No remote-cursor Monaco rendering (server emits `cursor-update` but client only stubs it). | `Room.jsx`, `socketService.js` | Roadmap feature — server side already present; finish the client. |
| **P2-7** | No structured logging / request IDs / error-tracking (Sentry/Pino). | backend | Debugging and incident response are harder than they need to be. |
| **P2-8** | No npm workspaces/monorepo tooling; duplicated scripts; no Prettier config. | repo root | DX; single `npm install`/`npm run test` at root would streamline. |
| **P2-9** | No `Rate Limit`/`Retry-After` headers tuning on `authLimiter` (uses default), and `skipSuccessfulRequests:false` is deliberate (good) but undocumented. | `rateLimiter.js` | Minor config/observability polish. |

---

## 3. 4-Stage Modernization Roadmap

Strictly sequential: each stage's exit criteria gate the next. Ordered from most-critical infrastructure → minor polish.

### Stage 1 — Security Hardening & Critical Infrastructure
*Goal: eliminate the RCE path and harden authentication/access before anything else. The app must not ship as-is.*

1. **Contain/isolate code execution.** Disable the unsandboxed local fallback in production; execute user code only through an isolated runtime (Judge0/CE, or a per-submission container with cgroups + memory cap + CPU limit + no network + read-only FS + scrubbed env, e.g. gVisor/Docker `--network=none --pids-limit`). If local execution must remain, it runs **only** inside that sandbox and never as the server user.
2. **Harden room access.** Separate the human room code from the invite token; use high-entropy invite tokens (≥128-bit) for the "you must be a member" check; add join/socket-event rate limiting (wire in `socketLimiter`); enforce membership on every execute path.
3. **Harden authentication.** Move JWT to httpOnly `SameSite=Secure` cookies (or add refresh+rotation+revocation on the current bearer model); enable a production CSP; stop sending the token via socket query string; strengthen password policy; add per-account lockout.
4. **Apply the defined-but-unused validators/limiters** so validation and rate limiting are actually enforced on the wire.

**Exit criteria:** No untrusted code can run outside an isolated sandbox; room join and socket events are rate-limited; auth is cookie/CSP-hardened with revocation; a security regression test suite (at minimum the RCE sandbox tests) is green.

### Stage 2 — Reliability, Performance & Observability
*Goal: make the system robust, observable, and non-self-DoSing under real load.*

1. **Debounce/batch persistence & broadcast** — coalesce `code-change` (client debounce + dirty-tracking; server periodic flush of `snapshotCode`).
2. **Async execution pipeline** — decouple Judge0 submission/polling from the HTTP request (job queue + WebSocket push of `code-execution-result`), with circuit breaker and backoff.
3. **Centralize error handling** — `asyncHandler`/`AppError`, route all errors through `errorHandler`, add request IDs + structured logging (Pino) + error tracking; add real `/health` and `/ready` endpoints; add DB connect retry/backoff.
4. **Data-layer tuning** — paginate rooms/messages, use `.lean()`, add missing indexes, fix the join-room TOCTOU with a unique guard, add ownership transfer.

**Exit criteria:** p95 API latency targets met in load test; no unbounded DB writes or in-request 15s blocking; all controller errors flow through the global handler; logs/request-IDs/health endpoints deployed and verified.

### Stage 3 — Test Coverage, CI/CD & Architecture Refactor
*Goal: lock in quality with automated gates and reduce module complexity.*

1. **Tooling:** add ESLint, Prettier, editorconfig; a GitHub Actions pipeline running lint + test + build on every PR with coverage thresholds.
2. **Frontend refactor:** decompose `Room.jsx` into focused hooks/components (editor collab, presence, chat, execution); introduce PropTypes/TypeScript; add an axios interceptor for 401 handling.
3. **Backend refactor:** service layer for room logic, validation middleware, remove duplicated try/catch.
4. **Tests:** cover `AuthContext`, `SocketService`, hooks, components, and chat/execution flows; add E2E (Playwright) smoke flows (register → create room → collab → run code → delete).

**Exit criteria:** CI is green on every PR with enforced coverage (frontend ≥70%, backend maintained ≥80%); `Room.jsx` decomposed; lint clean; E2E smoke suite passing.

### Stage 4 — Scalability, Product Polish & DX
*Goal: horizontal scaling and differentiated product features.*

1. **Multi-instance scaling:** Socket.IO Redis adapter + sticky sessions; presence/state in Redis; replace in-memory `roomPresence`.
2. **Conflict-free editing:** integrate Yjs/CRDT (or OT) to replace last-write-wins; render remote cursors in Monaco (delta decorations); add revision history/restore.
3. **Roles & permissions:** owner/editor/viewer enforced server-side; ownership transfer; audit log.
4. **Ops & DX:** Docker Compose one-command setup; deployment docs; interview mode (timer, problem packs, hidden tests); feature flags.

**Exit criteria:** horizontal scale test with 2+ instances passes; CRDT editing correctness verified under concurrent load; roles enforced server-side; `docker compose up` yields a working full stack.

---

## 4. Autonomous Agent Prompts

Four standalone prompts — one per roadmap stage. Each is self-contained (no prior stage required), with explicit boundaries, ordered steps, and measurable success criteria. They target agents like Cursor, Claude Engineer, or Aider. **Use the codebase at repo root; keep all changes on branch `arena/019fcdcb-pairpad`.**

### Prompt 1 — Stage 1: Security Hardening (RCE Sandbox + Auth)

```
ROLE: You are a senior application-security engineer working in the PairPad monorepo at the repo root.

BOUNDARIES (do NOT cross):
- Do not refactor business logic, change the UI, or modify the public REST/socket API contract.
- Do not change data models or schema shape.
- All existing backend tests must keep passing (npm test in backend/).
- Do NOT introduce new npm dependencies unless strictly necessary; prefer platform capabilities.

TASK: The highest-severity issue is an unsandboxed remote code-execution path.
backend/src/services/judge0Service.js -> executeLocally() runs arbitrary user-supplied
Node/Python under the server's OS user (no chroot/container/seccomp/env-scrub).
Additionally the room-code/join model and JWT-storage model are weak.

EXECUTE IN THIS ORDER:
1. In judge0Service.js, isolate ALL local execution so untrusted code can never run with
   server privileges: gate it behind NODE_ENV==='development' OR an explicit
   ALLOW_LOCAL_EXECUTION flag that defaults to false in production; when blocked, return a
   503 "code execution disabled" via executeController instead of running anything.
   Add per-child resource limits (memoryBytes, maxBuffer, timeout), scrub environment vars
   (delete JWT_SECRET/MONGODB_URI/JUDGE0_API_KEY from the child env), and disallow the child
   from inheriting stdio handles beyond a piped stdout/stderr.
2. Write a new Jest suite backend/tests/execSandbox.test.js asserting: (a) production mode
   without the flag refuses to execute, (b) the child env does not contain secrets,
   (c) a memory/CPU runaway is killed within the limit, (d) unsupported languages return null
   without touching the filesystem.
3. Wire the already-defined but unused limiters into effect: apply socketLimiter (or an
   equivalent) to socket handshake and to join-room/chat-message/code-change events; enforce
   validateChatMessage for chat payloads. Remove tokens from the socket query string and rely
   on handshake.auth only.
4. Add a security/incident section to docs/system-design.md describing the execution sandbox,
   its resource limits, and the threat model.

SUCCESS CRITERIA (all must hold):
- grep confirms no execFile/spawn runs user code outside the sandbox guard.
- `cd backend && npm test` passes (existing 195 + new sandbox tests) with >=80% overall coverage.
- `npm audit` reports 0 vulnerabilities.
- A test demonstrates the child process cannot read JWT_SECRET from its environment.
- No public API route/socket event was renamed or removed.
```

### Prompt 2 — Stage 2: Reliability, Performance & Observability

```
ROLE: You are a backend reliability/performance engineer in the PairPad monorepo (repo root).

BOUNDARIES (do NOT cross):
- Do not change the API or socket event payload contract (frontend is out of scope this stage).
- Do not rework the code-execution sandbox from Stage 1 (assume it exists / leave as-is).
- All existing backend tests must pass; add tests for new behavior.
- Prefer in-repo patterns (existing apiResponse, errorHandler) over new libraries.

TASK: The system self-DoSes and is hard to observe. Every keystroke triggers a MongoDB write
and a full-document broadcast; Judge0 polling blocks the HTTP request up to ~15s; errors are
hand-rolled in every controller with console-only logging.

EXECUTE IN THIS ORDER:
1. COALESCE PERSISTENCE: in backend/src/sockets/socketHandler.js, debounce/batch the
   Room.updateOne snapshot so it flushes at most once per N ms (configurable) and only when
   content actually changed. Preserve last-write-wins semantics.
2. CENTRALIZE ERRORS: introduce asyncHandler + AppError in middleware/errorHandler.js; convert
   every controller to throw/next() through the global handler instead of inline sendError;
   ensure ApiError carries a stable `code` string and an HTTP status. Keep the existing
   { message, data|errors } envelope so the frontend is unaffected.
3. OBSERVABILITY: add request-id middleware (generate or pass-through X-Request-Id), structured
   logging for requests/errors/DB/socket events, and real /health (liveness) + /ready
   (DB connected) endpoints. Wire DB connect retry with exponential backoff.
4. DATA LAYER: paginate GET /api/rooms and the messages query, use .lean() on read-only paths,
   add a unique index/guard to fix the join-room duplicate-membership TOCTOU, and add an
   owner-transfer endpoint (POST /api/rooms/:roomCode/transfer { userId }) so owners can leave.
5. Add Jest coverage for the new asyncHandler, request-id middleware, debounce, pagination, and
   transfer endpoints.

SUCCESS CRITERIA (all must hold):
- Load test (e.g., a simple script hitting /api/execute and /api/rooms) shows the DB write count
  for snapshot persistence is <1 per keystroke (debounced) and p95 for /api/execute is below the
  Judge0 poll ceiling for accepted jobs.
- Every controller now routes through the global error handler (grep for sendError in
  controllers returns only helper/validation branches or none).
- /health and /ready return correct status in both healthy and DB-down simulations.
- `cd backend && npm test` passes with coverage maintained at >=80% overall.
- No public route or socket payload changed.
```

### Prompt 3 — Stage 3: Test Coverage, CI/CD & Architecture Refactor

```
ROLE: You are a frontend architect + CI/CD engineer in the PairPad monorepo (repo root).

BOUNDARIES (do NOT cross):
- Do not change backend behavior or the public API contract.
- Do not change the execution sandbox or auth-storage model (out of scope this stage).
- Keep the app on React 18 / Vite 5; do not introduce a new build system.

TASK: The frontend is under-tested and the largest component is a monolith. There is no
linting, formatting, or CI. Fix all of these.

EXECUTE IN THIS ORDER:
1. TOOLING: add ESLint (flat config) + Prettier + .editorconfig with sensible React defaults;
   add "lint" and "format" scripts in frontend/package.json; fix or disable-then-document any
   legacy issues rather than suppressing silently.
2. CI: create .github/workflows/ci.yml that runs, on every PR and push to main:
   backend `npm ci && npm test` (with coverage threshold), frontend `npm ci && npm run lint &&
   npm run build && npm test` (Vitest). Fail the workflow on coverage regressions below a
   committed threshold (enforce via jest/vitest coverageThreshold config).
3. REFACTOR Room.jsx: extract at least these modules in frontend/src:
   - hooks/useCollaboration (socket connect/reconnect/rejoin, presence, code-change sync)
   - hooks/useChat (history, send, dedupe via appendUniqueMessage)
   - hooks/useCodeExecution (run code, stdin, broadcast result handling)
   - components/ExecutionPanel and components/ChatPanel
   Room.jsx should compose these and keep editor + layout concerns. Behavior must be unchanged.
4. ADD AN AXIOS INTERCEPTOR for 401 -> logout/redirect in AuthContext.jsx instead of ad-hoc
   per-request handling, and stop mutating axios.defaults globally where possible.
5. TESTS: write unit tests for AuthContext (all 4 auth states incl. 'unavailable' + retry),
   SocketService (connect/disconnect/reconnect, emitWithAck success+error+timeout, event
   subscription), useChat/useCodeExecution hooks, and the new components. Add a Playwright E2E
   smoke suite: register -> create room -> join -> type in Monaco -> run code -> delete room.

SUCCESS CRITERIA (all must hold):
- `cd frontend && npm run lint` is clean; `npm run build` succeeds; `npm test` passes.
- CI workflow is present and was validated to run locally equivalent commands successfully.
- Room.jsx is reduced below ~300 lines and its logic lives in the extracted hooks/components.
- Frontend unit coverage >=70% (enforced), and the E2E smoke suite passes against a local backend.
- Existing backend tests remain green.
```

### Prompt 4 — Stage 4: Scalability, CRDT Editing & Product Polish

```
ROLE: You are a distributed-systems + product engineer in the PairPad monorepo (repo root).

BOUNDARIES (do NOT cross):
- Do not degrade security mitigations from Stage 1.
- Preserve the public REST and Socket.IO event contract for existing clients; additive events
  are allowed but must be documented.
- Multi-instance changes must keep the single-instance (default) deployment working with no env
  change required.

TASK: Take PairPad from single-instance to horizontally scalable and introduce conflict-free
collaborative editing and role-based access.

EXECUTE IN THIS ORDER:
1. SCALING: add @socket.io/redis-adapter (and a documented REDIS_URL env). Make roomPresence in
   backend/src/sockets/socketHandler.js use a Redis-backed store (e.g., hash/member sets) with a
   TTL/cleanup strategy so presence survives multiple instances; keep an in-memory fallback when
   REDIS_URL is absent. Document sticky-session requirements for HTTP long-polling transport.
2. CRDT EDITING: replace the full-document last-write-wins sync with Yjs (yjs + y-websocket or a
   custom provider over the existing socket) so concurrent edits merge without clobbering.
   Preserve snapshotCode persistence via a debounced flush. Update both backend socket handler and
   frontend Room editor wiring.
3. REMOTE CURSORS: render peer cursors in Monaco using delta decorations from the existing
   cursor-update events (server already broadcasts them).
4. ROLES & PERMISSIONS: add a role field to Room membership (owner/editor/viewer) enforced
   server-side on code-change, execute, delete, and message-send; add ownership transfer UI+
   API. Add an audit log collection for room/role/delete events.
5. OPS & DX: add docker-compose.yml (backend, frontend, mongodb, and optional redis/judge0) so
   `docker compose up` runs the whole stack; add a DEPLOYMENT.md; wire the roadmap's interview
   mode behind a feature flag (timer, problem packs, hidden test cases) as a thin skeleton.

SUCCESS CRITERIA (all must hold):
- Two Socket.IO server instances behind a shared Redis successfully sync presence, chat, and code
  state in a 2-instance test; single-instance (no REDIS_URL) still passes the full test suite.
- Concurrent edits from two clients converge (CRDT) — verified by an automated test that merges
  interleaved edits and asserts no data loss.
- Remote cursors appear in Monaco for peers (manual + automated smoke check).
- Viewer role cannot send code-change/execute; editor cannot delete room — enforced server-side
  and covered by tests.
- `docker compose up` yields a reachable frontend, backend, and MongoDB with one command; docs
  updated.
- All backend and frontend tests pass and coverage thresholds are maintained.
```

---

## Appendix — Key Verification Commands

```bash
cd backend && npm test                 # 195 tests / 15 suites, ~81% coverage
cd frontend && npm test && npm run build  # 13 tests, build ok
npm audit --omit=dev                   # 0 vulnerabilities
grep -rn socketLimiter src/            # defined but unused (P1-4)
```
