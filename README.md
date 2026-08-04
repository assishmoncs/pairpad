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

PairPad is a full-stack collaborative coding platform built around a Monaco editor, Socket.IO real-time sync, and an integrated code execution engine. Multiple users can join a shared room, edit the same code simultaneously, chat, run code, and see each other's presence — all in the browser.

---

## Features

| Category | What It Does |
|----------|-------------|
| **Authentication** | Register, login, JWT sessions, auth retry on server hiccup |
| **Rooms** | Create rooms with 6-character invite codes, join/leave/delete, multi-language support |
| **Live Editing** | Monaco Editor with full-document Socket.IO synchronization |
| **Presence** | Real-time list of who is online in the current room |
| **Chat** | Persistent in-room messaging (MongoDB-backed) with real-time broadcast |
| **Code Execution** | Judge0 API integration (RapidAPI or self-hosted) with automatic **local fallback** for JS/TS/Python |
| **Security** | Rate limiting on auth and execution endpoints, CORS guard, centralized error handling |
| **Resilience** | Infinite socket reconnection, amber pulsing "Reconnecting…" badge, transient auth-unavailable state |

### Current Limitations (MVP)

- Concurrent edits use **last-write-wins** (CRDT/OT not yet implemented)
- Presence is tracked **in-memory** — not suitable for multi-server deployments without Redis
- Editor snapshots are **debounced** (500 ms), so a hard crash can lose the most recent keystrokes

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, React Router v6, Axios, Socket.IO Client, Monaco Editor |
| **Backend** | Node.js 18+, Express 4, Socket.IO 4, MongoDB + Mongoose 8, JWT, bcryptjs, express-rate-limit |
| **Code Execution** | Judge0 CE (RapidAPI or self-hosted) · local Node.js / Python fallback when key is absent |
| **Testing** | Backend: Jest 29 + Supertest (214 tests / 17 suites, ~79% coverage) · Frontend: Vitest + Testing Library (30 tests, ~86% coverage) |
| **Tooling** | ESLint + Prettier (both apps) · GitHub Actions CI (lint → test → build) · coverage thresholds enforced |

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 18 or higher | Required |
| **MongoDB** | Any (local or Atlas) | Required |
| **Judge0 API Key** | Optional | Code execution falls back to local runner without it |

---

## Quick Start

### 1 — Clone

```bash
git clone https://github.com/tsunade601/pairpad.git
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
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` | No (default: 7d) |
| `CLIENT_URL` | Allowed browser origin for CORS and Socket.IO | Yes |
| `JUDGE0_BASE_URL` | Judge0 API base URL | No |
| `JUDGE0_API_KEY` | RapidAPI or self-hosted key | No |
| `JUDGE0_RAPIDAPI_HOST` | RapidAPI host header | No |
| `LOG_LEVEL` | Logging level: `fatal`/`error`/`warn`/`info`/`debug` | No (default: debug) |
| `ALLOW_LOCAL_EXECUTION` | Enable the unsandboxed local runner in production (`true` to enable) | No (default: disabled in prod) |

> **Without a Judge0 key:** in development, JavaScript, TypeScript, and Python execute via the local Node.js / Python runner. Other languages require a configured Judge0 instance. In production the local runner is disabled unless `ALLOW_LOCAL_EXECUTION=true` — prefer an isolated Judge0 instance.

---

## Project Structure

```
pairpad/
├── backend/
│   ├── src/
│   │   ├── config/          # MongoDB connection
│   │   ├── controllers/     # auth, rooms, code execution, ownership transfer
│   │   ├── middleware/       # JWT auth, rate limiting, request id, error handler
│   │   ├── models/          # User, Room, Message (Mongoose)
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # Judge0 client + hardened local fallback runner
│   │   ├── sockets/         # Socket.IO collaboration handler (rate-limited, debounced)
│   │   ├── utils/           # logger, asyncHandler, validation, room access, token
│   │   └── server.js        # Entry point (health/readiness probes, graceful shutdown)
│   ├── tests/               # 17 Jest test suites (214 tests, coverage thresholds)
│   ├── eslint.config.cjs    # ESLint (Node + Jest)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/      # FormField, LanguageSelect, ChatPanel, ExecutionPanel
│   │   ├── constants/       # Supported languages list
│   │   ├── context/         # AuthContext (JWT + auth status machine)
│   │   ├── hooks/           # useAsyncAction, useChat, useCodeExecution, useCollaboration
│   │   ├── pages/           # Login, Register, Dashboard, Room
│   │   ├── routes/          # AppRoutes + ProtectedRoute
│   │   ├── services/        # SocketService singleton
│   │   ├── utils/           # apiError, messages (appendUniqueMessage)
│   │   └── main.jsx         # Vite entry point
│   ├── index.html
│   ├── eslint.config.js     # ESLint flat config (React + hooks + Vitest)
│   ├── .prettierrc.json
│   └── vite.config.js       # Vite + proxy + coverage thresholds
├── .github/workflows/ci.yml # Lint → test (coverage) → build for both apps
├── docs/
│   ├── system-design.md
│   ├── DEPLOYMENT.md
├── .editorconfig
├── README.md
└── LICENSE
```

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | — | Create account → returns `{ token, user }` |
| `POST` | `/api/auth/login` | — | Authenticate → returns `{ token, user }` |
| `GET` | `/api/auth/me` | Bearer | Get the current user |

### Rooms

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/rooms` | Bearer | Create a room |
| `GET` | `/api/rooms` | Bearer | List all rooms for the current user |
| `GET` | `/api/rooms/:identifier` | Bearer | Get room by code or ID |
| `POST` | `/api/rooms/:roomCode/join` | Bearer | Join a room |
| `POST` | `/api/rooms/:roomCode/leave` | Bearer | Leave a room |
| `POST` | `/api/rooms/:roomCode/transfer` | Bearer | Transfer ownership to a member (owner only) |
| `DELETE` | `/api/rooms/:roomCode` | Bearer | Delete a room (owner only) |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | — | Liveness probe (`status: ok`, uptime) |
| `GET` | `/ready` | — | Readiness probe (DB connected → `200`, otherwise `503`) |

### Messages & Execution

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/messages/room/:roomCode` | Bearer | Chat history (last 50 messages) |
| `POST` | `/api/execute` | Bearer | Run code via Judge0 (or local fallback) |

**Execute request body:**
```json
{
  "source_code": "console.log('hello')",
  "language": "javascript",
  "roomCode": "ABC123",
  "stdin": ""
}
```

**Execute response shape:**
```json
{
  "stdout": "hello\n",
  "stderr": "",
  "status": "success",
  "time": "0.041s",
  "memory": "N/A",
  "exitCode": 0
}
```

---

## Socket.IO Events

All connections require `handshake.auth.token` (JWT). Room membership is verified before any `join-room` acknowledgement.

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join-room` | `{ roomCode }` | Join a room channel |
| `leave-room` | — | Leave the current room |
| `code-change` | `{ content, language }` | Broadcast editor content |
| `cursor-update` | `{ position, selection }` | Share cursor position |
| `chat-message` | `{ content }` | Send a chat message |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `presence-update` | `{ users[] }` | Updated online-user list |
| `user-joined` | `{ userId, name }` | A user joined |
| `user-left` | `{ userId, name }` | A user left |
| `code-change` | `{ content, language, userId }` | Remote editor update |
| `cursor-update` | `{ userId, position, selection }` | Remote cursor move |
| `chat-message` | `{ _id, content, sender, createdAt }` | New chat message |
| `code-execution-result` | `{ result, executedBy, language }` | Broadcast execution output |
| `room-deleted` | — | Room was deleted by owner |

---

## Available Scripts

### Backend

```bash
cd backend
npm run dev          # Hot-reload dev server (nodemon)
npm start            # Production server
npm test             # Full Jest suite with coverage (thresholds enforced)
npm run test:unit    # Unit tests only (no MongoDB needed)
npm run test:watch   # Watch mode
npm run lint         # ESLint
npm run lint:fix     # Auto-fix lint issues
```

### Frontend

```bash
cd frontend
npm run dev          # Vite dev server with HMR
npm run build        # Production bundle → dist/
npm test             # Vitest run (all tests)
npm run test:coverage# Vitest with coverage (thresholds enforced)
npm run lint         # ESLint
npm run format       # Prettier write
npm run preview      # Preview the production build
```

---

## Code Execution — How It Works

PairPad uses a two-tier execution pipeline:

1. **Judge0 API** — if `JUDGE0_API_KEY` is set and valid, code is submitted to Judge0 (RapidAPI or self-hosted). Supports all languages in the `LANGUAGE_MAP` (JS, TS, Python, Java, C, C++, Go, Rust, PHP, Ruby).

2. **Local fallback** — if the key is absent, is the placeholder value, or if Judge0 returns an error, PairPad can execute **JavaScript/TypeScript** with the local `node` runtime and **Python** with the local `python`/`python3` runtime. This runs in a child process with a scrubbed environment (no app secrets), a 5-second timeout, a 128 MB heap cap, and a 1 MB output cap.

> ⚠️ **Security note:** the local runner is a *resource guard, not a full sandbox* (no container/seccomp/cgroups). It is **disabled in production unless `ALLOW_LOCAL_EXECUTION=true` is set**. Prefer a fully isolated runner (Judge0 / containerized) in production.

Results are returned in the HTTP response **and** broadcast to the entire room via `code-execution-result`.

---

## Roadmap

- [x] Persistent editor snapshots on the Room document (debounced persistence)
- [x] `stdin` input textarea in the Run Code panel
- [x] Room invite code shown in-header with copy-to-clipboard
- [x] Ownership transfer (owner → member)
- [x] CI/CD pipeline (GitHub Actions) with lint, format, test, and coverage gates
- [x] Hardened local code execution (env scrubbing + resource limits + production gating)
- [x] Centralized error handling with request-ids + structured logging + `/health`/`/ready`
- [ ] CRDT / Operational Transform for conflict-free concurrent editing
- [ ] Remote cursor rendering in Monaco (delta decorations)
- [ ] Role-based permissions (owner / editor / viewer)
- [ ] Redis adapter for multi-instance Socket.IO horizontal scaling
- [ ] Docker Compose setup with a single `docker compose up`
- [ ] Interview mode — countdown timer, problem packs, hidden test cases

---

## Contributing

1. Fork and create a feature branch from `main`
2. Keep changes focused; one concern per PR
3. Add or update tests when modifying API or socket behavior
4. Ensure `npm test` passes in both `backend/` and `frontend/` before opening a PR
5. Open a pull request with a clear description

---

## License

MIT — see [LICENSE](./LICENSE) for details.
