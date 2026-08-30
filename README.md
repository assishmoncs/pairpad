# PairPad

<div align="center">

**Real-time collaborative coding for pair programming, technical interviews, and shared code execution.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Local-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

</div>

PairPad is a full-stack collaborative coding platform built around Monaco Editor, Socket.IO, a conflict-free sequence CRDT, persistent room state and revision history, remote cursors, role-based access, integrated code execution, multi-file workspaces, technical interview workflows, Redis scaling, and operational quality gates. Multiple users can join a room, edit files concurrently, compare revisions, restore checkpoints, chat, execute code, and collaborate directly in the browser.

## Features

| Category | What It Does |
|---|---|
| **Authentication** | Register, login, short-lived access tokens, rotating HttpOnly refresh sessions, logout-all |
| **Rooms** | Create, join, leave, delete, transfer ownership, and manage member roles |
| **Live Editing** | Monaco Editor backed by a deterministic sequence CRDT; concurrent edits converge without last-write-wins document replacement |
| **Remote Cursors** | Throttled cursor/selection broadcasting with deterministic collaborator colors and hover names |
| **Presence** | Real-time connected-member state with reconnect cleanup and optional Redis distribution |
| **Roles** | Owner, editor, and viewer permissions enforced by REST and Socket.IO and mirrored by the UI |
| **Revision History** | Automatic checkpoints, manual checkpoints, comparisons, authorship metadata, and owner-only restore |
| **Workspace** | Multi-file tree with create, rename, delete, language detection, and per-file CRDT state |
| **Interview Mode** | Problem statements, candidate assignment, timer, lifecycle controls, public samples, and private hidden tests |
| **Chat** | MongoDB-backed persistent room messaging with real-time delivery |
| **Code Execution** | Judge0 integration with optional isolated worker execution for supported languages |
| **Security** | Helmet/CSP, CORS allowlist, rate limiting, input limits, request correlation, role enforcement, token rotation |
| **Resilience** | Socket reconnection, room rejoin, CRDT recovery, document restore propagation, health/readiness probes |
| **Observability** | Structured logs, request correlation, protected Prometheus-compatible metrics, performance budgets |
| **Performance** | API p95/error-rate budget and frontend JavaScript bundle-size budget executed in CI |

## Quick Start

```bash
git clone https://github.com/assishmoncs/pairpad.git
cd pairpad
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
# fill in MONGODB_URI and JWT_SECRET
npm run dev
```

Backend: `http://localhost:5000` · health: `GET /health` · readiness: `GET /ready` · metrics: `GET /metrics`.

### Frontend

```bash
cd ../frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`.

### Docker

```bash
docker compose up --build
```

The Compose stack includes MongoDB, Redis, backend, frontend, and the isolated execution worker. Local host execution remains disabled by default.

## API Reference

The checked-in OpenAPI contract is available at `docs/openapi.yaml`. When the backend is running:

- `/api/openapi.yaml` — machine-readable contract
- `/api/docs` — API documentation landing page

See `docs/API.md` for the endpoint guide.

## Testing and quality

```bash
# backend
cd backend
npm test
npm run lint
npm run perf

# frontend
cd ../frontend
npm test
npm run lint
npm run format:check
npm run perf
npm run test:e2e
```

Performance budgets are described in `docs/PERFORMANCE.md`. CI runs functional, security, browser, and performance gates with MongoDB and Redis services.

## Project Structure

```text
pairpad/
├── backend/
│   ├── scripts/             # Performance/load budget checks
│   ├── src/
│   │   ├── controllers/     # Auth, rooms, execution, revisions, interviews, workspace
│   │   ├── middleware/      # Auth, limits, request/error handling
│   │   ├── models/          # User, Room, Message, Revision, WorkspaceFile, RefreshSession
│   │   ├── routes/          # REST routes
│   │   ├── services/        # Execution, CRDT, Redis, history, workspace
│   │   ├── sockets/         # Socket.IO collaboration and scaling
│   │   └── utils/           # Validation, auth, access, logging, metrics
│   └── tests/
├── frontend/
│   └── src/
│       ├── components/      # Room panels, history, members, execution, chat, interview, workspace
│       ├── context/         # AuthContext
│       ├── hooks/           # Collaboration, CRDT, cursors, chat, execution
│       ├── pages/
│       └── services/
├── execution-worker/        # Isolated execution service
├── .github/workflows/
├── docs/
├── docker-compose.yml
├── README.md
├── SECURITY.md
└── LICENSE
```

## Quality Roadmap

- [x] Repository quality baseline and security automation
- [x] Docker deployment foundation
- [x] CRDT-based concurrent collaboration
- [x] Remote Monaco cursors and presence cleanup
- [x] Owner/editor/viewer authorization
- [x] Revision history, comparison, checkpoints, and restore
- [x] Rotating refresh-token sessions / hardened cookies
- [x] Redis-backed horizontal Socket.IO scaling
- [x] Isolated execution worker integration
- [x] Playwright E2E and adversarial security suites
- [x] OpenAPI contract
- [x] Interview mode with hidden test cases
- [x] Multi-file workspace
- [x] Observability baseline
- [x] Performance budgets and load-test smoke gates
- [ ] Accessibility automated gate
- [ ] Production deployment promotion/rollback automation
- [ ] Consolidate workspace/interview OpenAPI fragments into the main contract
- [ ] Full production-grade sandbox fleet with dedicated hosts and stronger isolation

See `docs/QUALITY_BASELINE.md`, `docs/SECURITY.md`, `docs/PERFORMANCE.md`, `docs/OBSERVABILITY.md`, `docs/DEPLOYMENT.md`, and `docs/system-design.md`.

## License

MIT — see [LICENSE](./LICENSE).
