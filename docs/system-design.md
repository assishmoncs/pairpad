# PairPad System Design

## High-Level Architecture

PairPad uses a monorepo with a React + Vite frontend and a Node.js + Express backend. The backend exposes REST endpoints for authentication and room management, while Socket.IO (coming in Phase 3) will handle low-latency collaboration events.

## Core Components

### Frontend (React + Vite)
- Authentication pages (login, register)
- Dashboard for room management
- Room pages with member lists
- Auth context for state management
- Protected routes for authenticated users

### Backend API (Express)
- JWT-based authentication
- User management with bcrypt password hashing
- Room lifecycle management (CRUD)
- MongoDB data persistence

### Database (MongoDB)
- **Users**: name, email (unique), hashed password, timestamps
- **Rooms**: name, roomCode (6-char unique), owner, members[], language, description, timestamps
- **Messages**: room, sender, content, timestamps (for future chat)

### Realtime Layer (Socket.IO) - Phase 3
- Room channels for editor sync
- Typing indicators and cursor positions
- Chat functionality
- Online user status

### Code Execution Service (Judge0) - Phase 4
- Receives execution requests
- Returns results to participants

## Current Status (Phase 2)

✅ **Implemented:**
- User registration and login with JWT
- Protected API routes with auth middleware
- Room creation, joining, and management
- MongoDB models with proper relationships
- React frontend with auth context
- Dashboard and room pages

## Data Flow Overview

1. User registers or logs in via `/api/auth/*` endpoints
2. JWT token stored in localStorage
3. Axios interceptor adds Authorization header to requests
4. User creates/joins rooms via `/api/rooms/*` endpoints
5. Room data persisted in MongoDB
6. Frontend displays room info and member lists

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Authenticate user
- `GET /api/auth/me` - Get current user (protected)

### Rooms
- `POST /api/rooms` - Create room (protected)
- `GET /api/rooms` - List user's rooms (protected)
- `GET /api/rooms/:identifier` - Get room details (protected)
- `POST /api/rooms/:roomCode/join` - Join room (protected)
- `POST /api/rooms/:roomCode/leave` - Leave room (protected)
- `DELETE /api/rooms/:roomCode` - Delete room (owner only, protected)

## Future Feature Roadmap

### Phase 3 - Realtime Collaboration
- Socket.IO integration for live updates
- Monaco editor with collaborative editing
- Operational transformation (OT) or CRDT for conflict resolution
- Live cursors and presence indicators

### Phase 4 - Code Execution & Chat
- Judge0 integration for code execution
- Multi-language support
- Real-time chat within rooms
- Session history and replay

### Future Enhancements
- Role-based room permissions (owner/editor/viewer)
- WebRTC voice/video integration
- Analytics dashboards
- Horizontal scaling with Redis adapter
