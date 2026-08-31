# PairPad Testing Strategy

PairPad uses layered validation so fast unit tests catch local regressions while integration and browser tests validate the real product boundaries.

## Layers

### Backend unit tests

Jest covers security-sensitive utilities and services including:

- CRDT convergence and idempotency
- role/permission rules
- refresh-session rotation and reuse detection
- revision checkpoint policy
- Redis scaling helpers
- workspace path validation and language detection
- interview lifecycle and hidden-test redaction
- pagination validation
- execution-worker request contracts

### Backend integration tests

Mongo-backed Supertest suites exercise:

- registration/login/authenticated requests
- room creation and membership
- authorization failures
- role changes
- protected code execution
- malformed and oversized payload handling
- room isolation

Integration suites are designed to skip cleanly when MongoDB is unavailable locally, while CI supplies MongoDB and Redis services.

### Frontend tests

Vitest + Testing Library cover:

- workspace UX
- keyboard shortcuts
- remote cursor utilities
- workspace member controls
- CRDT model behavior

### Browser E2E

Playwright validates the real application boundary with independent browser contexts:

1. register two users
2. create and join a room
3. establish Socket.IO collaboration
4. create/select a workspace file
5. edit in one browser
6. verify the second browser receives the edit
7. validate login failure feedback

Playwright retains screenshots, video and traces on failures in CI.

## Required local validation

```bash
cd backend
npm install
npm run lint
npm test

cd ../frontend
npm install
npm run lint
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

For E2E, MongoDB and the backend/frontend applications must be running. CI uses `.github/workflows/quality.yml` to provide those dependencies automatically.

## Failure-path priorities

The highest-value regressions are not simple render failures. Tests should protect:

- stale or expired authentication
- unauthorized room access
- viewer write/execute attempts
- concurrent CRDT edits
- reconnect and room rejoin
- distributed presence
- revision restore consistency
- interview expiration and hidden-test privacy
- workspace path traversal and duplicate files
- execution timeout/output limits
