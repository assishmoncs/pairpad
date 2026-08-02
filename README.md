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
- Editor content is **not** persisted to the database on each keystroke

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, React Router v6, Axios, Socket.IO Client, Monaco Editor |
| **Backend** | Node.js 18+, Express 4, Socket.IO 4, MongoDB + Mongoose 8, JWT, bcryptjs, express-rate-limit |
| **Code Execution** | Judge0 CE (RapidAPI or self-hosted) · local Node.js / Python fallback when key is absent |
| **Testing** | Backend: Jest 29 + Supertest (195 tests / 15 suites) · Frontend: Vitest + Testing Library (11 tests) |

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

> **Without a Judge0 key:** JavaScript, TypeScript, and Python still execute via the local Node.js / Python runner. Other languages require a configured Judge0 instance.

---

## Project Structure

```
pairpad/
├── backend/
│   ├── src/
│   │   ├── config/          # MongoDB connection
│   │   ├── controllers/     # auth, rooms, code execution
│   │   ├── middleware/       # JWT auth, rate limiting, error handler
│   │   ├── models/          # User, Room, Message (Mongoose)
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # Judge0 client + local fallback runner
│   │   ├── sockets/         # Socket.IO collaboration handler
│   │   ├── utils/           # Shared utilities (token, room access, validation)
│   │   └── server.js        # Entry point
│   ├── tests/               # 15 Jest test suites (195 tests)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/      # FormField, LanguageSelect
│   │   ├── constants/       # Supported languages list
│   │   ├── context/         # AuthContext (JWT + auth status machine)
│   │   ├── hooks/           # useAsyncAction
│   │   ├── pages/           # Login, Register, Dashboard, Room
│   │   ├── routes/          # AppRoutes + ProtectedRoute
│   │   ├── services/        # SocketService singleton
│   │   ├── utils/           # API error helper
│   │   └── main.jsx         # Vite entry point
│   ├── index.html
│   └── vite.config.js       # Vite + proxy config
├── docs/
│   └── system-design.md
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
| `DELETE` | `/api/rooms/:roomCode` | Bearer | Delete a room (owner only) |

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
npm test             # Full Jest suite with coverage
npm run test:unit    # Unit tests only (no MongoDB needed)
npm run test:watch   # Watch mode
```

### Frontend

```bash
cd frontend
npm run dev          # Vite dev server with HMR
npm run build        # Production bundle → dist/
npm test             # Vitest run (all tests)
npm run preview      # Preview the production build
```

---

## Code Execution — How It Works

PairPad uses a two-tier execution pipeline:

1. **Judge0 API** — if `JUDGE0_API_KEY` is set and valid, code is submitted to Judge0 (RapidAPI or self-hosted). Supports all languages in the `LANGUAGE_MAP` (JS, TS, Python, Java, C, C++, Go, Rust, PHP, Ruby).

2. **Local fallback** — if the key is absent, is the placeholder value, or if Judge0 returns an error, PairPad automatically executes **JavaScript/TypeScript** with the local `node` runtime and **Python** with the local `python`/`python3` runtime — using a sandboxed child process with a 5-second timeout and 1 MB output cap.

Results are returned in the HTTP response **and** broadcast to the entire room via `code-execution-result`.

---

## Roadmap

- [ ] CRDT / Operational Transform for conflict-free concurrent editing
- [ ] Persistent editor snapshots on the Room document
- [ ] `stdin` input textarea in the Run Code panel
- [ ] Room invite code shown in-header with copy-to-clipboard
- [ ] Remote cursor rendering in Monaco (delta decorations)
- [ ] Role-based permissions (owner / editor / viewer)
- [ ] Redis adapter for multi-instance Socket.IO horizontal scaling
- [ ] Docker Compose setup with a single `docker compose up`
- [ ] CI/CD pipeline (GitHub Actions) with test and lint gates
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
