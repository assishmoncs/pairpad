# PairPad System Design

## High-Level Architecture

PairPad is a monorepo with a React + Vite frontend and a Node.js + Express backend. The backend exposes REST APIs for auth, rooms, messages, and code execution. Socket.IO handles low-latency collaboration (code sync, presence, chat).

```
Browser (React + Monaco)
        |
        |  REST (/api/*)  +  WebSocket (Socket.IO)
        v
Express + Socket.IO (Helmet + Rate Limiting) ---- MongoDB (Users, Rooms, Messages)
        |
        +---- Judge0 API (Primary) / Local Node & Python Runner (Fallback)
```

## Core Components

### Frontend
- Auth pages (login, register) and JWT stored in `localStorage`
- Dashboard for creating and opening rooms
- Room page: Monaco editor, presence list, chat, stdin input, code execution output, and room code copy pill
- `AuthContext` + Axios defaults for `Authorization` header
- `SocketService` singleton for real-time connection management, auto-reconnect, and event bus
- `LoadingSpinner` and `NotFound` (404) components for smooth UX feedback

### Backend API
- Security headers enforced via `helmet` and rate limiting (`apiLimiter`, `authLimiter`, `executeLimiter`)
- JWT authentication (register, login, `/me` with session unavailability handling)
- Room lifecycle (create, join, leave, delete with socket broadcast)
- Chat message history (MongoDB backed)
- Code execution via Judge0 wrapper with automatic local Node.js / Python runner fallback
- Centralized error handling middleware

### Realtime Layer (Socket.IO)
- JWT required on handshake
- Room membership verified before join
- Events: `join-room`, `leave-room`, `code-change`, `cursor-update`, `chat-message`, `code-execution-result`, `room-deleted`
- Presence broadcast on join/leave/disconnect
- Asynchronous editor `snapshotCode` persistence to MongoDB on `code-change`
- Chat messages persisted to MongoDB then broadcast with stringified IDs

### Database (MongoDB + Mongoose)
- **User** — name, email (unique), hashed password
- **Room** — name, roomCode, owner, members, language, description, snapshotCode
- **Message** — room, sender, content

### Code Execution
- Server-side only (API key never exposed to client)
- Primary: Judge0 CE API supporting JS, TS, Python, Java, C/C++, Go, Rust, PHP, Ruby
- Fallback: Local sandboxed runner for JS, TS, and Python with 5s execution timeout and 1MB buffer cap
- Supports custom `stdin` inputs passed from the frontend UI

## Data Flow

1. User registers or logs in → JWT returned and stored client-side.
2. User creates or opens a room via REST; room data (including saved `snapshotCode`) is fetched.
3. Room page connects Socket.IO with JWT and joins the room channel.
4. Monaco edits emit `code-change`; peers receive updates, and room `snapshotCode` is persisted to DB.
5. Chat messages are saved to MongoDB and broadcast with stringified IDs.
6. Run Code posts to `/api/execute` with code and optional `stdin`; execution output is returned and broadcast.

## MVP Limitations

- **Conflict resolution:** last-write-wins full document sync (CRDT/OT planned).
- **Scaling:** in-memory presence; no Redis adapter for multi-instance Socket.IO scaling.
- **Cursors:** server supports cursor events; client rendering is minimal.

## Roadmap

- CRDT or OT for conflict-safe concurrent editing
- Role-based permissions (owner / editor / viewer)
- Session replay and historical revisions
- Redis adapter for horizontal Socket.IO scaling
- Docker Compose + CI pipeline
- Interview tooling (timer, question packs, test cases)
