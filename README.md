# PairPad

**Phase 2 Complete – Auth + Rooms working; realtime and execution next**

Real-time collaborative coding platform built with Node.js, React, and WebSockets.

## Current Status (Phase 2)

✅ **Implemented:**
- JWT authentication (register, login, protected routes)
- User management with bcrypt password hashing
- Room lifecycle (create, join, view, leave, delete)
- MongoDB models for Users, Rooms, and Messages
- REST API endpoints for auth and rooms
- React frontend with auth context and protected routes
- Dashboard for room management
- Room pages with member lists

🚧 **Coming in Phase 3:**
- Real-time collaboration with Socket.IO
- Monaco editor integration
- Live code synchronization

🚧 **Coming in Phase 4:**
- Code execution via Judge0
- Chat functionality
- Advanced room features

## Prerequisites

- Node.js 16+
- MongoDB (local or cloud instance)

## Installation

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your settings (MONGODB_URI, JWT_SECRET, etc.)
npm run dev
```

Server will start on `http://localhost:5000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App will be available at `http://localhost:5173`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Rooms
- `POST /api/rooms` - Create new room (protected)
- `GET /api/rooms` - List user's rooms (protected)
- `GET /api/rooms/:identifier` - Get room by ID or code (protected)
- `POST /api/rooms/:roomCode/join` - Join a room (protected)
- `POST /api/rooms/:roomCode/leave` - Leave a room (protected)
- `DELETE /api/rooms/:roomCode` - Delete room (owner only, protected)

## Folder Structure

```
pairpad/
├── backend/
│   ├── src/
│   │   ├── config/       # Database configuration
│   │   ├── controllers/  # Route handlers
│   │   ├── middleware/   # Auth middleware
│   │   ├── models/       # Mongoose schemas
│   │   ├── routes/       # Express routers
│   │   ├── utils/        # Helper functions
│   │   └── server.js     # Entry point
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── context/      # Auth context
│   │   ├── pages/        # Route components
│   │   ├── routes/       # App routing
│   │   ├── main.jsx      # Entry point
│   │   └── index.css     # Global styles
│   ├── package.json
│   └── vite.config.js
├── docs/
└── README.md
```

## Environment Variables

See `.env.example` in the backend directory for required variables:
- `PORT` - Server port (default: 5000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT signing
- `JWT_EXPIRES_IN` - Token expiration (default: 1d)
- `CLIENT_URL` - Frontend URL for CORS

## Development Commands

- Backend: `cd backend && npm run dev`
- Frontend: `cd frontend && npm run dev`
- Backend production: `cd backend && npm start`
- Frontend build: `cd frontend && npm run build`
