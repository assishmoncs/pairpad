# PairPad

**Phase 3 Complete – Real-time Collaboration Working**

Real-time collaborative coding platform built with Node.js, Express, React, Socket.IO, and Monaco Editor.

## Current Status (Phase 3 of 4)

### ✅ Implemented Features

**Authentication & Authorization**
- JWT-based authentication
- User registration and login
- Protected routes and API endpoints

**Room Management**
- Create rooms with unique invite codes
- Join/leave rooms
- View room members and details
- Language selection (JavaScript, TypeScript, Python, Java, C++, C, Go, Rust)

**Real-time Collaboration**
- Live code synchronization using Socket.IO
- Multiple users can edit simultaneously
- Full document sync (MVP approach)
- Connection status indicator

**Presence System**
- See who's online in your room
- Real-time join/leave notifications
- User list sidebar

**In-Room Chat**
- Send and receive messages in real-time
- Message persistence in MongoDB
- Chat history on room join

**Code Editor**
- Monaco Editor (same engine as VS Code)
- Syntax highlighting for multiple languages
- Dark theme optimized for coding

### 🚧 Coming in Phase 4
- Code execution via Judge0 API
- Docker containerization
- CI/CD pipeline
- Enhanced conflict resolution (CRDT/OT)

## Prerequisites

- Node.js 16+
- MongoDB (local or cloud instance)

## Installation

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your settings (PORT, MONGODB_URI, JWT_SECRET, CLIENT_URL)
npm run dev
```

Server will start on `http://localhost:5000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend will start on `http://localhost:5173`

## Environment Variables

See `.env.example` for required configuration:

```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/pairpad
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

## Folder Structure

```
pairpad/
├── backend/
│   ├── src/
│   │   ├── config/        # Database configuration
│   │   ├── controllers/   # Request handlers
│   │   ├── middleware/    # Auth middleware
│   │   ├── models/        # Mongoose schemas (User, Room, Message)
│   │   ├── routes/        # Express routers
│   │   ├── sockets/       # Socket.IO handlers
│   │   ├── utils/         # Helper functions
│   │   └── server.js      # Main entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── context/       # React context (Auth)
│   │   ├── pages/         # Route pages (Login, Dashboard, Room)
│   │   ├── services/      # API and Socket services
│   │   ├── App.jsx        # Root component
│   │   └── main.jsx       # Vite entry point
│   └── package.json
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Rooms
- `POST /api/rooms` - Create new room (protected)
- `GET /api/rooms` - List user's rooms (protected)
- `GET /api/rooms/:roomCode` - Get room details (protected)
- `POST /api/rooms/:roomCode/join` - Join a room (protected)
- `POST /api/rooms/:roomCode/leave` - Leave a room (protected)
- `DELETE /api/rooms/:roomCode` - Delete room (owner only, protected)

### Messages
- `GET /api/messages/room/:roomCode` - Get room chat history (protected)

## Socket.IO Events

### Client → Server
- `join-room` - Join a room channel
- `leave-room` - Leave current room
- `code-change` - Broadcast code changes
- `cursor-update` - Share cursor position
- `chat-message` - Send chat message

### Server → Client
- `presence-update` - Updated list of online users
- `user-joined` - Notification when user joins
- `user-left` - Notification when user leaves
- `code-change` - Receive code changes from others
- `cursor-update` - Receive cursor updates
- `chat-message` - Receive chat messages

## Limitations (MVP)

- **Conflict Resolution**: Uses simple last-write-wins. Simultaneous edits may cause conflicts. Future: implement CRDT or Operational Transforms.
- **Single Instance**: Socket.IO presence is not shared across multiple server instances. Future: use Redis adapter.
- **No Cursor Colors**: All cursors appear the same. Future: assign unique colors per user.

## Tech Stack

**Backend**
- Node.js + Express
- Socket.IO
- MongoDB + Mongoose
- JWT for authentication
- bcryptjs for password hashing

**Frontend**
- React 18
- Vite
- React Router
- Axios
- Socket.IO Client
- Monaco Editor

## License

MIT
