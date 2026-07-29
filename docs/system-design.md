# PairPad System Design

## High-Level Architecture

PairPad is a monorepo with a React + Vite frontend and a Node.js + Express backend. The backend exposes REST APIs for auth, rooms, messages, and code execution. Socket.IO handles low-latency collaboration (code sync, presence, chat).

```
Browser (React + Monaco)
        |
        |  REST (/api/*)  +  WebSocket (Socket.IO)
        v
Express + Socket.IO  ----  MongoDB
        |
        +---- Judge0 (code execution)
```

## Core Components

### Frontend
- Auth pages (login, register) and JWT stored in `localStorage`
- Dashboard for creating and opening rooms
- Room page: Monaco editor, presence list, chat, run-code output
- `AuthContext` + Axios defaults for `Authorization` header
- Socket client service for realtime events

### Backend API
- JWT authentication (register, login, `/me`)
- Room lifecycle (create, join, leave, delete)
- Chat message history
- Code execution via Judge0 wrapper
- Rate limiting on auth and execute routes
- Centralized error handling

### Realtime Layer (Socket.IO)
- JWT required on handshake
- Room membership checked before join
- Events: `join-room`, `leave-room`, `code-change`, `cursor-update`, `chat-message`
- Presence broadcast on join/leave/disconnect
- Chat messages persisted to MongoDB then broadcast

### Database (MongoDB + Mongoose)
- **User** — name, email (unique), hashed password
- **Room** — name, roomCode, owner, members, language, description
- **Message** — room, sender, content

### Code Execution (Judge0)
- Server-side only (API key never sent to the client)
- Language map for JS, TS, Python, Java, C/C++, Go, Rust, and others
- Optional broadcast of results to the Socket.IO room

## Data Flow

1. User registers or logs in → JWT returned and stored client-side.
2. User creates or joins a room via REST.
3. Room page connects Socket.IO with the JWT and joins the room channel.
4. Monaco edits emit `code-change`; peers apply updates (full-document sync MVP).
5. Chat messages are saved and broadcast.
6. Run Code posts to `/api/execute`; Judge0 result is returned (and may be broadcast).

## MVP Limitations

- **Conflict resolution:** last-write-wins full document sync (not CRDT/OT yet).
- **Scaling:** in-memory presence; no Redis adapter for multi-instance Socket.IO.
- **Persistence:** editor buffer is not snapshotted to the room document on every change.
- **Cursors:** server supports cursor events; client coloring is minimal.

## Roadmap

- CRDT or OT for conflict-safe concurrent editing
- Role-based permissions (owner / editor / viewer)
- Persist editor snapshots and session replay
- Redis adapter for horizontal Socket.IO scaling
- Docker Compose + CI pipeline
- Interview tooling (timer, question packs, test cases)
