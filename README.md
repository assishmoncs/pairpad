# PairPad

PairPad is a full-stack real-time collaborative coding platform inspired by Google Docs, LeetCode, and CodeSignal.

## Overview

PairPad allows users to create or join coding rooms, collaborate in real time, chat with participants, view active users, and run code through an execution service.

## Features

- Real-time collaborative code editing rooms
- In-room participant chat
- Online user presence indicators
- Placeholder JWT-based authentication flow
- Placeholder Judge0-based code execution integration
- Monorepo-ready frontend and backend workspace structure

## Planned Features

- Conflict-safe synchronization (CRDT/OT)
- Rich role/permission controls inside rooms
- Interview session tooling and replay support
- Multi-language templates with testcase packs
- Scalable multi-instance socket architecture

## Tech Stack

- **Frontend:** React, Vite, Monaco Editor, Axios, Socket.IO Client
- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT, bcryptjs
- **Docs:** Markdown architecture and roadmap documentation

## Folder Structure

```text
pairpad/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── routes/
│   │   ├── assets/
│   │   └── App.jsx
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── models/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── sockets/
│   │   ├── config/
│   │   ├── utils/
│   │   └── server.js
│   ├── package.json
│   ├── .env.example
│   └── nodemon.json
├── docs/
│   └── system-design.md
├── screenshots/
├── README.md
├── LICENSE
└── .gitignore
```

## Installation Guide

1. Clone the repository.
2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Install backend dependencies:
   ```bash
   cd ../backend
   npm install
   ```

## Environment Variables

Copy and adapt backend environment settings:

```bash
cp backend/.env.example backend/.env
```

Set values for MongoDB, JWT secret, frontend URL, and Judge0 API credentials.

## Development Setup

Run backend:

```bash
cd backend
npm run dev
```

Run frontend (in another terminal):

```bash
cd frontend
npm run dev
```

## Future Improvements

- Add complete auth/session lifecycle and validation
- Implement production-grade room synchronization engine
- Add persistence for editor snapshots and room activity
- Integrate robust CI, tests, and containerized deployment

## Contributing

1. Fork the repo and create a feature branch.
2. Make focused changes with tests where applicable.
3. Open a pull request with a clear description.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
