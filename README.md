# PairPad

**Real-time collaborative coding** for pair programming, technical interviews, and shared code execution.

PairPad combines a Monaco-based editor, Socket.IO collaboration, room chat, presence indicators, and optional Judge0-powered code runs—inspired by Google Docs–style editing and platforms like LeetCode / CodeSignal.

---

## Features

| Area | What works today |
|------|------------------|
| **Auth** | Register, login, JWT sessions, protected API routes |
| **Rooms** | Create rooms with invite codes, join / leave / delete, multi-language labels |
| **Live editing** | Monaco Editor + Socket.IO full-document sync |
| **Presence** | Online users in the current room |
| **Chat** | In-room messaging with MongoDB history |
| **Run code** | Judge0 integration (JS, TS, Python, Java, C/C++, Go, Rust, and more) |
| **Hardening** | Rate limits on auth & execute, CORS, centralized errors, basic auth tests |

### Known MVP limits

- Concurrent edits use **last-write-wins** (not CRDT/OT yet).
- Presence is **in-memory** (single server instance).
- Editor content is **not** fully persisted to the room document on every keystroke.

---

## Tech stack

**Frontend:** React 18, Vite, React Router, Axios, Socket.IO Client, Monaco Editor  
**Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT, bcryptjs, express-rate-limit  
**Execution:** Judge0 CE (RapidAPI or self-hosted)

---

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Optional: Judge0 API key for the **Run Code** button

---

## Quick start

### 1. Clone

```bash
git clone https://github.com/tsunade601/pairpad.git
cd pairpad
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — at least MONGODB_URI and JWT_SECRET
npm run dev
```

API listens on `http://localhost:5000` (health: `GET /health`).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs on `http://localhost:5173` (Vite proxies `/api` to the backend).

### Environment variables

Copy from `backend/.env.example`:

| Variable | Purpose |
|----------|---------|
| `PORT` | Backend port (default `5000`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing tokens |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `7d`) |
| `CLIENT_URL` | Frontend origin for CORS / Socket.IO |
| `JUDGE0_BASE_URL` | Judge0 API base URL |
| `JUDGE0_API_KEY` | Judge0 / RapidAPI key |
| `JUDGE0_RAPIDAPI_HOST` | RapidAPI host header |

Without a Judge0 key, auth, rooms, live editing, and chat still work; execution returns a clear configuration error.

---

## Project structure

```text
pairpad/
├── backend/
│   ├── src/
│   │   ├── config/          # DB connection
│   │   ├── controllers/     # Auth, rooms, execute
│   │   ├── middleware/      # Auth, rate limit, errors
│   │   ├── models/          # User, Room, Message
│   │   ├── routes/
│   │   ├── services/        # Judge0 client
│   │   ├── sockets/         # Socket.IO collaboration
│   │   ├── utils/
│   │   └── server.js
│   ├── tests/
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── context/         # AuthProvider
│   │   ├── pages/           # Login, Register, Dashboard, Room
│   │   ├── routes/
│   │   ├── services/        # Socket client
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
├── docs/
│   └── system-design.md
├── README.md
└── LICENSE
```

---

## API overview

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | No | Create account |
| `POST` | `/api/auth/login` | No | Login |
| `GET` | `/api/auth/me` | Yes | Current user |

### Rooms

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/rooms` | Yes | Create room |
| `GET` | `/api/rooms` | Yes | List my rooms |
| `GET` | `/api/rooms/:identifier` | Yes | Room by code or id |
| `POST` | `/api/rooms/:roomCode/join` | Yes | Join room |
| `POST` | `/api/rooms/:roomCode/leave` | Yes | Leave room |
| `DELETE` | `/api/rooms/:roomCode` | Yes | Delete (owner) |

### Messages & execution

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/messages/room/:roomCode` | Yes | Chat history |
| `POST` | `/api/execute` | Yes | Run code via Judge0 |

---

## Socket.IO events

Connections must send a JWT (`handshake.auth.token` or query `token`).

**Client → server:** `join-room`, `leave-room`, `code-change`, `cursor-update`, `chat-message`  
**Server → client:** `presence-update`, `user-joined`, `user-left`, `code-change`, `cursor-update`, `chat-message`, `code-execution-result`

Details: [docs/system-design.md](./docs/system-design.md).

---

## Scripts

```bash
# Backend
cd backend && npm run dev      # nodemon
cd backend && npm start        # production-style start
cd backend && npm test         # full Jest suite (auth endpoint tests need MongoDB)
cd backend && npm run test:unit # unit tests only, no MongoDB required

# Frontend
cd frontend && npm run dev
cd frontend && npm run build
cd frontend && npm run preview
```

---

## Roadmap

- [ ] CRDT / OT conflict-safe editing
- [ ] Persist editor snapshots on the room
- [ ] Role-based permissions (owner / editor / viewer)
- [ ] Redis adapter for multi-instance Socket.IO
- [ ] Docker Compose + CI
- [ ] Interview mode (timer, templates, test cases)

---

## Contributing

1. Fork the repo and create a feature branch.
2. Keep changes focused; add or update tests when touching auth or APIs.
3. Open a pull request with a clear description of what and why.

---

## License

MIT © See [LICENSE](./LICENSE).
