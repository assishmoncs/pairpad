# PairPad

<div align="center">

**Real-time collaborative coding for pair programming, technical interviews, and shared code execution.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Local-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

</div>

PairPad is a full-stack collaborative coding platform built around Monaco Editor, Socket.IO, a conflict-free sequence CRDT, persistent room state, and integrated code execution. Multiple users can join a room, edit the same document concurrently, see remote cursors and presence, chat, execute code, and use owner/editor/viewer permissions directly in the browser.

## Features

| Category | What It Does |
|---|---|
| **Authentication** | Register, login, JWT access/refresh sessions |
| **Rooms** | Create, join, leave, delete, transfer ownership, and manage member roles |
| **Live Editing** | Monaco Editor backed by a deterministic sequence CRDT; concurrent edits converge without last-write-wins document replacement |
| **Remote Cursors** | Throttled cursor/selection broadcasting with deterministic collaborator colors and hover names |
| **Presence** | Real-time list of connected room members |
| **Roles** | Owner, editor, and viewer permissions enforced by REST and Socket.IO and mirrored by the UI |
| **Chat** | MongoDB-backed persistent room messaging with real-time delivery |
| **Code Execution** | Judge0 integration with guarded local JS/TS/Python fallback |
| **Security** | Helmet/CSP, CORS allowlist, rate limiting, input limits, request correlation, role enforcement |
| **Resilience** | Socket reconnection, room rejoin, CRDT state recovery, health/readiness probes |

### Current Limitations

- Presence is still in-memory; horizontal Socket.IO scaling requires a shared adapter such as Redis.
- The character-level CRDT is intentionally simple and stores more metadata than binary CRDT formats.
- Authentication hardening is not yet migrated fully to httpOnly cookie sessions with server-side refresh-token revocation.
- The local code runner is a resource guard, not a security sandbox; production should use isolated Judge0/container workers.

## Room roles

| Role | View | Edit | Execute | Manage members | Transfer ownership | Delete room |
|---|---:|---:|---:|---:|---:|---:|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | No | No | No |
| Viewer | Yes | No | No | No | No | No |

Owners can change member roles with `PATCH /api/rooms/:roomCode/members/:userId/role`. The server remains authoritative; hiding UI controls is never used as a security boundary.

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, React Router v6, Axios, Socket.IO Client, Monaco Editor |
| **Backend** | Node.js 18+, Express 4, Socket.IO 4, MongoDB + Mongoose 8, JWT, bcryptjs, express-rate-limit, Helmet |
| **Collaboration** | Dependency-free sequence CRDT over authenticated Socket.IO transport |
| **Code Execution** | Judge0 CE · guarded local Node.js / Python fallback |
| **Testing** | Jest + Supertest · Vitest + Testing Library |
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

Backend: `http://localhost:5000` · health: `GET /health`.

### Frontend

```bash
cd ../frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`.

## Environment Variables

See `backend/.env.example` for the complete configuration. Production must keep `ALLOW_LOCAL_EXECUTION` unset and use a fully isolated execution service.

## Project Structure

```text
pairpad/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   └── utils/
│   └── tests/
├── frontend/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── pages/
│       ├── routes/
│       └── services/
├── .github/workflows/
├── docs/
├── README.md
├── SECURITY.md
└── LICENSE
```

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Authenticate |
| POST | `/api/auth/refresh` | — | Refresh access token |
| GET | `/api/auth/me` | Bearer | Get current user |

### Rooms

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/rooms` | Bearer | Create a room |
| GET | `/api/rooms` | Bearer | List user's rooms |
| GET | `/api/rooms/:identifier` | Bearer | Get a room |
| POST | `/api/rooms/:roomCode/join` | Bearer | Join a room |
| POST | `/api/rooms/:roomCode/leave` | Bearer | Leave a room |
| PATCH | `/api/rooms/:roomCode/members/:userId/role` | Owner | Set editor/viewer role |
| POST | `/api/rooms/:roomCode/transfer` | Owner | Transfer ownership |
| DELETE | `/api/rooms/:roomCode` | Owner | Delete a room |

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/ready` | MongoDB readiness |

### Messages & Execution

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/messages/room/:roomCode` | Bearer | Chat history |
| POST | `/api/execute` | Editor/Owner | Execute code |

## Socket.IO Events

All connections require an authenticated JWT handshake. Room membership is checked on join, and editor permissions are checked for code writes.

### Client → Server

| Event | Payload | Permission |
|---|---|---|
| `join-room` | `{ roomCode }` | Member |
| `leave-room` | — | Member |
| `crdt-sync-request` | `{}` | Member |
| `crdt-operation` | CRDT replace operation | Editor/Owner |
| `code-change` | `{ content, language }` | Editor/Owner (legacy clients) |
| `cursor-update` | `{ position, selection }` | Member |
| `chat-message` | `{ content }` | Member |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `crdt-sync` | `{ state, version, role }` | Authoritative CRDT state |
| `crdt-operation` | CRDT operation | Merged collaborative edit |
| `presence-update` | `{ users[] }` | Connected members |
| `cursor-update` | `{ userId, position, selection }` | Remote cursor |
| `member-role-updated` | `{ userId, role }` | Permission change |
| `chat-message` | `{ _id, content, sender, createdAt }` | New message |
| `code-execution-result` | `{ result, executedBy, language }` | Execution result |
| `room-deleted` | `{ roomCode }` | Room removed |

## Testing

Backend: `npm test` · frontend: `npm test` / `npm run test:coverage`.

The repository includes focused CRDT and RBAC unit tests. Full application/E2E verification should be run in CI or a clean environment with dependencies installed.

## Quality Roadmap

- [x] Repository quality baseline and security automation
- [x] Docker deployment foundation
- [x] CRDT-based concurrent collaboration
- [x] Remote Monaco cursors and presence cleanup
- [x] Owner/editor/viewer authorization
- [ ] Revision history and restore
- [ ] Rotating refresh-token sessions / hardened cookies
- [ ] Redis-backed horizontal Socket.IO scaling
- [ ] Isolated execution workers and Docker sandboxing
- [ ] Playwright E2E and adversarial security suites
- [ ] OpenAPI contract
- [ ] Interview mode with hidden test cases
- [ ] Multi-file workspace
- [ ] Observability, performance, and accessibility gates

See `docs/RBAC.md`, `docs/system-design.md`, `docs/DEPLOYMENT.md`, and `docs/QUALITY_BASELINE.md`.

## License

MIT — see [LICENSE](./LICENSE).
