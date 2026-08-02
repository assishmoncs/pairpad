# PairPad

> Real-time collaborative coding platform for pair programming, technical interviews, and shared code execution.

PairPad combines a Monaco-based code editor, Socket.IO real-time collaboration, room-based chat, presence indicators, and Judge0-powered code execution—inspired by Google Docs-style editing and platforms like LeetCode and CodeSignal.

---

## Features

| Category | Description |
|----------|-------------|
| **Authentication** | User registration, login, JWT sessions, and protected API routes |
| **Rooms** | Create rooms with invite codes, join/leave/delete rooms, multi-language support |
| **Live Editing** | Monaco Editor with Socket.IO full-document synchronization |
| **Presence** | Real-time display of online users in the current room |
| **Chat** | In-room messaging with MongoDB-backed chat history |
| **Code Execution** | Judge0 integration supporting JavaScript, TypeScript, Python, Java, C/C++, Go, Rust, and more |
| **Security** | Rate limiting on authentication and code execution endpoints, CORS configuration, centralized error handling |

### MVP Limitations

- Concurrent edits use **last-write-wins** conflict resolution (CRDT/OT not yet implemented)
- Presence tracking is **in-memory** (single server instance only)
- Editor content is **not** persisted to the room document on every keystroke

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, Vite, React Router, Axios, Socket.IO Client, Monaco Editor |
| **Backend** | Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT, bcryptjs, express-rate-limit |
| **Execution** | Judge0 CE (RapidAPI or self-hosted) |

---

## Prerequisites

Before running PairPad, ensure you have the following installed:

- **Node.js** 18 or higher
- **MongoDB** instance (local installation or MongoDB Atlas cloud)
- **Judge0 API Key** (optional, required only for the code execution feature)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/tsunade601/pairpad.git
cd pairpad
```

### 2. Configure and Start the Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MONGODB_URI and JWT_SECRET
npm run dev
```

The API server starts on `http://localhost:5000` (health check available at `GET /health`).

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend application runs on `http://localhost:5173` with Vite proxying `/api` requests to the backend.

### Environment Variables

Copy the example environment file and configure the following variables:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Backend server port (default: `5000`) | Yes |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | Secret key for signing JWT tokens | Yes |
| `JWT_EXPIRES_IN` | Token expiration time (e.g., `7d`) | No |
| `CLIENT_URL` | Frontend origin for CORS and Socket.IO | Yes |
| `JUDGE0_BASE_URL` | Judge0 API base URL | No |
| `JUDGE0_API_KEY` | Judge0 or RapidAPI key | No |
| `JUDGE0_RAPIDAPI_HOST` | RapidAPI host header | No |

> **Note:** Without a Judge0 API key, the authentication, rooms, live editing, and chat features continue to work. The code execution feature will return a configuration error when attempting to run code.

---

## Project Structure

```
pairpad/
├── backend/
│   ├── src/
│   │   ├── config/          # Database configuration
│   │   ├── controllers/     # Auth, rooms, code execution
│   │   ├── middleware/      # Authentication, rate limiting, error handling
│   │   ├── models/          # Mongoose models (User, Room, Message)
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # Judge0 API client
│   │   ├── sockets/         # Socket.IO collaboration handlers
│   │   ├── utils/          # Utility functions
│   │   └── server.js       # Server entry point
│   ├── tests/              # Jest test suites
│   ├── .env.example        # Environment variables template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── context/         # AuthContext provider
│   │   ├── pages/          # Login, Register, Dashboard, Room
│   │   ├── routes/         # Application route tree
│   │   ├── services/       # Socket.IO client service
│   │   └── main.jsx        # Vite entry point
│   ├── index.html
│   └── package.json
├── docs/
│   └── system-design.md    # System design documentation
├── README.md
└── LICENSE
```

---

## API Overview

### Authentication

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| `POST` | `/api/auth/register` | No | Create a new user account |
| `POST` | `/api/auth/login` | No | Authenticate and receive JWT |
| `GET` | `/api/auth/me` | Yes | Get current user information |

The `register` and `login` endpoints return a JWT token at `data.token` along with user details at `data.user`.

### Rooms

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| `POST` | `/api/rooms` | Yes | Create a new room |
| `GET` | `/api/rooms` | Yes | List all rooms for the current user |
| `GET` | `/api/rooms/:identifier` | Yes | Get room by code or ID |
| `POST` | `/api/rooms/:roomCode/join` | Yes | Join an existing room |
| `POST` | `/api/rooms/:roomCode/leave` | Yes | Leave a room |
| `DELETE` | `/api/rooms/:roomCode` | Yes | Delete a room (owner only) |

### Messages & Execution

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| `GET` | `/api/messages/room/:roomCode` | Yes | Retrieve chat history for a room |
| `POST` | `/api/execute` | Yes | Execute code via Judge0 |

---

## Socket.IO Events

All Socket.IO connections require JWT authentication via `handshake.auth.token` or query parameter `token`.

### Client → Server Events

| Event | Description |
|-------|-------------|
| `join-room` | Join a collaboration room |
| `leave-room` | Leave the current room |
| `code-change` | Broadcast code editor changes |
| `cursor-update` | Share cursor position updates |
| `chat-message` | Send a chat message |

### Server → Client Events

| Event | Description |
|-------|-------------|
| `presence-update` | Updated list of online users |
| `user-joined` | Notification when a user joins |
| `user-left` | Notification when a user leaves |
| `code-change` | Receive code updates from other users |
| `cursor-update` | Receive cursor position updates |
| `chat-message` | Receive chat messages |
| `code-execution-result` | Code execution results from Judge0 |

For detailed information, see the [System Design Documentation](./docs/system-design.md).

---

## Available Scripts

### Backend

```bash
cd backend
npm run dev          # Start development server with hot reload (nodemon)
npm start            # Start production server
npm test             # Run full Jest test suite (requires MongoDB for auth tests)
npm run test:unit    # Run unit tests only (no MongoDB required)
```

### Frontend

```bash
cd frontend
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run preview      # Preview production build locally
```

---

## Roadmap

The following features are planned for future releases:

- [ ] CRDT/OT-based conflict resolution for safe concurrent editing
- [ ] Persistent editor snapshots on room documents
- [ ] Role-based permissions (owner / editor / viewer)
- [ ] Redis adapter for multi-instance Socket.IO scaling
- [ ] Docker Compose setup with CI/CD pipeline
- [ ] Interview mode with timer, templates, and test cases

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository and create a feature branch from `main`
2. Keep changes focused and well-organized
3. Add or update tests when modifying authentication or API functionality
4. Open a pull request with a clear description of the changes

---

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
