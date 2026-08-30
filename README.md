# PairPad

<div align="center">

**Real-time collaborative coding for pair programming, technical interviews, and shared code execution.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Local-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

</div>

PairPad is a full-stack collaborative coding platform built around Monaco Editor, Socket.IO, a conflict-free sequence CRDT, persistent room state and revision history, remote cursors, role-based access, workspace files, interview mode, and integrated code execution. Multiple users can join a room, edit documents concurrently, compare revisions, restore checkpoints, chat, execute code, and collaborate directly in the browser.

## Features

| Category | What It Does |
|---|---|
| **Authentication** | Register, login, JWT access/refresh sessions |
| **Rooms** | Create, join, leave, delete, transfer ownership, and manage member roles |
| **Live Editing** | Monaco Editor backed by a deterministic sequence CRDT; concurrent edits converge without last-write-wins document replacement |
| **Remote Cursors** | Throttled cursor/selection broadcasting with deterministic collaborator colors and hover names |
| **Presence** | Real-time list of connected room members with reconnect cleanup and Redis-backed multi-instance support |
| **Roles** | Owner, editor, and viewer permissions enforced by REST and Socket.IO and mirrored by the UI |
| **Revision History** | Automatic checkpoints, manual checkpoints, comparisons, authorship metadata, and owner-only restore |
| **Workspace** | Multi-file tree with create, rename, delete, language detection, per-file CRDT state, and active-file execution |
| **Interview Mode** | Problem statements, candidate assignment, timer, public/hidden tests, lifecycle controls, and safe hidden-result redaction |
| **Chat** | MongoDB-backed persistent room messaging with real-time delivery |
| **Code Execution** | Judge0 integration plus an optional isolated execution worker |
| **Security** | Helmet/CSP, CORS allowlist, rate limiting, input limits, request correlation, role enforcement, and protected metrics |
| **Resilience** | Socket reconnection, room rejoin, CRDT recovery, document restore propagation, and health/readiness probes |
| **Observability** | Structured request logs, request IDs, latency counters, status counters, and Prometheus-compatible metrics |
| **Accessibility** | Skip navigation, keyboard focus styling, reduced-motion support, semantic controls, and automated browser accessibility gates |

## Room roles

| Role | View | Edit | Execute | Create checkpoint | Manage members | Transfer ownership | Restore | Delete room |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | Yes | No | No | No | No |
| Viewer | Yes | No | No | No | No | No | No | No |

The server remains authoritative; hiding UI controls is never used as a security boundary.

## Accessibility

PairPad includes automated browser checks for accessible names, form labels, image alternatives, keyboard navigation hygiene, and visible focus. It also provides skip navigation, route-focus management, and reduced-motion support. See `docs/ACCESSIBILITY.md` for the release gate and manual WCAG review checklist.

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, React Router v6, Axios, Socket.IO Client, Monaco Editor |
| **Backend** | Node.js 18+, Express 4, Socket.IO 4, MongoDB + Mongoose 8, JWT, bcryptjs, express-rate-limit, Helmet |
| **Collaboration** | Dependency-free sequence CRDT over authenticated Socket.IO transport |
| **Code Execution** | Judge0 CE + optional isolated execution worker |
| **Testing** | Jest + Supertest · Vitest + Testing Library · Playwright |
| **Tooling** | ESLint + Prettier · GitHub Actions · CodeQL · Dependabot |

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

The Compose stack includes MongoDB, Redis, backend, frontend, and the optional execution worker. Production local execution remains disabled by default.

## API & Operations

The REST contract is exposed at `/api/openapi.yaml` with a human-readable documentation landing page at `/api/docs`. Operational metrics are exposed through `/metrics`; in production this endpoint requires `METRICS_TOKEN`.

## Testing

Backend: `npm test` · frontend: `npm test` / `npm run test:coverage` · browser: `npx playwright test`.

CI provisions MongoDB and Redis, runs lint/format/test/build checks, browser collaboration tests, security flows, performance budgets, and accessibility gates. Browser failures retain screenshots, traces, video, and server logs.

## Quality status

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
- [x] Performance budgets and load-test gates
- [x] Automated accessibility gate

See `docs/RBAC.md`, `docs/system-design.md`, `docs/DEPLOYMENT.md`, `docs/ACCESSIBILITY.md`, `docs/PERFORMANCE.md`, and `docs/QUALITY_BASELINE.md`.

## License

MIT — see [LICENSE](./LICENSE).
