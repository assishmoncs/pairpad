# PairPad

<div align="center">

**Real-time collaborative coding for pair programming, technical interviews, and shared code execution.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Local-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

</div>

---

PairPad is a full-stack collaborative coding platform built around a Monaco editor, Socket.IO transport, a conflict-free text CRDT, MongoDB persistence, and an integrated code execution engine. Multiple users can join a shared room, edit the same code concurrently, chat, run code, and see each other's presence in the browser.

---

## Features

| Category | What It Does |
|----------|-------------|
| **Authentication** | Register, login, JWT sessions, auth retry on server hiccup |
| **Rooms** | Create rooms with 6-character invite codes, join/leave/delete, multi-language support |
| **Live Editing** | Monaco Editor backed by a dependency-free sequence CRDT; concurrent operations converge deterministically |
| **Persistence** | CRDT state and a plain-text compatibility snapshot are persisted to MongoDB with debounced writes |
| **Presence** | Real-time list of who is online in the current room |
| **Chat** | Persistent in-room messaging (MongoDB-backed) with real-time broadcast |
| **Code Execution** | Judge0 API integration (RapidAPI or self-hosted) with automatic **local fallback** for JS/TS/Python |
| **Security** | Rate limiting on auth and execution endpoints, CORS guard, Helmet/CSP, centralized error handling |
| **Resilience** | Automatic socket reconnection, reconnecting badge, CRDT state synchronization after reconnect |

### Current Limitations (MVP)

- Presence is tracked **in-memory** — horizontal scaling requires a shared adapter such as Redis.
- Remote Monaco cursor rendering is still a separate milestone; cursor events already exist in the transport layer.
- Authentication currently uses bearer tokens in browser storage; hardened cookie sessions and refresh-token rotation are planned.
- The local code runner is a **resource guard, not a security sandbox**; production should use isolated Judge0/container workers.
- The current CRDT is character-level and coalesces editor changes to one contiguous replacement region per event; it is designed for deterministic convergence, not bandwidth-optimal delta encoding.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, React Router v6, Axios, Socket.IO Client, Monaco Editor, custom sequence CRDT |
| **Backend** | Node.js 18+, Express 4, Socket.IO 4, MongoDB + Mongoose 8, JWT, bcryptjs, express-rate-limit, Helmet |
| **Code Execution** | Judge0 CE (RapidAPI or self-hosted) · local Node.js / Python fallback when explicitly allowed |
| **Testing** | Backend: Jest + Supertest · Frontend: Vitest + Testing Library · CRDT convergence tests included |
| **Tooling** | ESLint + Prettier · GitHub Actions CI · CodeQL · Dependabot · coverage thresholds |

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 18 or higher | Required |
| **MongoDB** | Any (local or Atlas) | Required |
| **Judge0 API Key** | Optional | Code execution falls back to local runner without it in development |

---

## Quick Start

### 1 — Clone

```bash
git clone https://github.com/assishmoncs/pairpad.git
cd pairpad
```

### 2 — Configure & Start the Backend

```bash
cd backend
npm install
cp .env.example .env          # then fill in MONGODB_URI and JWT_SECRET
npm run dev
```

The API starts on `http://localhost:5000`. Health check: `GET /health`.

### 3 — Start the Frontend

```bash
cd ../frontend
npm install
npm run dev
```

The app runs on `http://localhost:5173`. Vite proxies `/api` and `/socket.io` to the backend automatically.

---

## Environment Variables

Copy and edit the backend environment template:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Backend port (default: `5000`) | Yes |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret (use a long random string) | Yes |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` | No |
| `CLIENT_URL` | Allowed browser origin for CORS and Socket.IO | Yes |
| `JUDGE0_BASE_URL` | Judge0 API base URL | No |
| `JUDGE0_API_KEY` | RapidAPI or self-hosted key | No |
| `JUDGE0_RAPIDAPI_HOST` | RapidAPI host header | No |
| `LOG_LEVEL` | Logging level: `fatal`/`error`/`warn`/`info`/`debug` | No |
| `ALLOW_LOCAL_EXECUTION` | Explicitly permit local execution in production | No (disabled by default) |

---

## Project Structure

```text
pairpad/
├── backend/
│   ├── src/
│   │   ├── config/          # MongoDB connection
│   │   ├── controllers/     # auth, rooms, code execution, ownership transfer
│   │   ├── middleware/      # JWT auth, rate limiting, request id, error handler
│   │   ├── models/          # User, Room, Message (Mongoose)
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # execution + CRDT state services
│   │   ├── sockets/         # collaboration + CRDT Socket.IO handlers
│   │   └── utils/            # logger, asyncHandler, validation, room access, token
│   ├── tests/               # Jest test suites
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── constants/       # Supported languages
│   │   ├── context/         # AuthContext
│   │   ├── hooks/            # Collaboration, CRDT, chat, execution hooks
│   │   ├── pages/            # Login, Register, Dashboard, Room
│   │   ├── routes/           # AppRoutes + ProtectedRoute
│   │   ├── services/         # SocketService
│   │   └── utils/            # validation/helpers + CRDT implementation
│   └── vite.config.js
├── .github/workflows/        # CI and security automation
├── docs/
│   ├── system-design.md
│   ├── DEPLOYMENT.md
│   └── QUALITY_BASELINE.md
├── README.md
├── SECURITY.md
└── LICENSE
```

---

## CRDT Collaboration

PairPad's collaborative editor uses a small sequence CRDT rather than replacing the whole document on every keystroke. Each inserted character has a unique logical identifier and an insertion anchor; deletions are tombstones. Concurrent operations are merged as a set and rendered in deterministic order, so clients converge to the same document state regardless of operation arrival order.

The server acts as the authenticated collaboration relay and persistence point:

```text
Monaco
  │
  ▼
Local CRDT
  │ replace operation
  ▼
Authenticated Socket.IO
  │
  ▼
Server CRDT state
  │     └── debounced MongoDB persistence
  ├──────────────► other collaborators
  └──────────────► CRDT sync on reconnect/join
```

The legacy full-document `code-change` event remains available for backwards compatibility with older clients, but the current Room UI waits for CRDT synchronization before enabling editing.

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | — | Create account |
| `POST` | `/api/auth/login` | — | Authenticate |
| `POST` | `/api/auth/refresh` | — | Refresh access token |
| `GET` | `/api/auth/me` | Bearer | Get the current user |

### Rooms

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/rooms` | Bearer | Create a room |
| `GET` | `/api/rooms` | Bearer | List all rooms for the current user |
| `GET` | `/api/rooms/:identifier` | Bearer | Get room by code or ID |
| `POST` | `/api/rooms/:roomCode/join` | Bearer | Join a room |
| `POST` | `/api/rooms/:roomCode/leave` | Bearer | Leave a room |
| `POST` | `/api/rooms/:roomCode/transfer` | Bearer | Transfer ownership to a member |
| `DELETE` | `/api/rooms/:roomCode` | Bearer | Delete a room (owner only) |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | — | Liveness probe |
| `GET` | `/ready` | — | Readiness probe |

### Messages & Execution

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/messages/room/:roomCode` | Bearer | Chat history |
| `POST` | `/api/execute` | Bearer | Run code via Judge0 or local fallback |

---

## Socket.IO Events

All connections require `handshake.auth.token` (JWT). Room membership is verified before acknowledging room joins.

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join-room` | `{ roomCode }` | Join a room channel |
| `leave-room` | — | Leave the current room |
| `code-change` | `{ content, language }` | Legacy full-document synchronization |
| `crdt-sync-request` | `{}` | Request authoritative CRDT state after joining/reconnecting |
| `crdt-operation` | `{ opId, type, insert, deleteIds }` | Apply a mergeable collaborative edit |
| `cursor-update` | `{ position, selection }` | Share cursor position |
| `chat-message` | `{ content }` | Send a chat message |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `presence-update` | `{ users[] }` | Updated online-user list |
| `user-joined` | `{ userId, name }` | A user joined |
| `user-left` | `{ userId, name }` | A user left |
| `code-change` | `{ content, language, userId }` | Legacy remote editor update |
| `crdt-sync` | `{ state, version }` | Authoritative serialized CRDT state |
| `crdt-operation` | `{ opId, type, insert, deleteIds }` | Remote collaborative edit |
| `crdt-error` | `{ message }` | Collaborative synchronization error |
| `cursor-update` | `{ userId, position, selection }` | Remote cursor update |
| `chat-message` | `{ _id, content, sender, createdAt }` | New chat message |
| `code-execution-result` | `{ result, executedBy, language }` | Execution output |
| `room-deleted` | — | Room was deleted |

---

## Available Scripts

### Backend

```bash
cd backend
npm run dev
npm start
npm test
npm run test:unit
npm run test:watch
npm run lint
npm run lint:fix
```

### Frontend

```bash
cd frontend
npm run dev
npm run build
npm test
npm run test:coverage
npm run lint
npm run format
npm run format:check
npm run preview
```

---

## Code Execution — How It Works

PairPad uses a two-tier execution pipeline:

1. **Judge0 API** — when configured, source code is submitted to Judge0 and results are polled until completion.
2. **Local fallback** — in development, or in explicitly permitted environments, JavaScript/TypeScript and Python can execute through local child processes with resource limits.

The local path uses a scrubbed environment, a 5-second timeout, a 128 MB Node heap cap, and a 1 MB output cap. It is **not a full sandbox** and is disabled by default in production.

Results are returned in the HTTP response and broadcast to the room via `code-execution-result`.

---

## Quality & Security Roadmap

PairPad is being hardened in deliberate milestones:

- [x] Centralized errors, request IDs, structured logging, health/readiness probes
- [x] Socket authentication, membership checks, rate limits, reconnect handling
- [x] Resource-guarded local execution with production gating
- [x] Linting, formatting, coverage-aware tests and CI
- [x] Conflict-free CRDT document synchronization
- [ ] Remote Monaco cursor rendering
- [ ] Role-based permissions
- [ ] Revision history and restore
- [ ] Rotating refresh-token sessions / hardened cookies
- [ ] Redis-backed horizontal Socket.IO scaling
- [ ] Isolated execution workers and Docker-based sandboxing
- [x] Docker Compose one-command environment
- [ ] Playwright end-to-end and adversarial security suites
- [ ] OpenAPI contract + generated API reference
- [ ] Interview mode with hidden test cases
- [ ] Multi-file workspace
- [ ] Observability, performance testing and accessibility gates

See `docs/QUALITY_BASELINE.md` for the acceptance criteria used to judge completion.

---

## Contributing

1. Fork and create a feature branch from `main`.
2. Keep changes focused; one concern per commit/PR.
3. Add or update tests when modifying API, socket, or CRDT behavior.
4. Run lint, format checks, tests and builds before opening a pull request.
5. Open a pull request with a clear description and validation notes.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
