# PairPad System Design

## High-Level Architecture

PairPad uses a monorepo with a React + Vite frontend and a Node.js + Express backend. The backend exposes REST endpoints for auth and room orchestration, while Socket.IO handles low-latency collaboration events (code updates, cursors, presence, and chat).

Core components:

- **Frontend (React + Monaco Editor):** room UI, collaborative editor surface, chat panel, and user presence indicators.
- **Backend API (Express):** authentication (JWT placeholder), room lifecycle, participant management, and execution request coordination.
- **Realtime Layer (Socket.IO):** room channels for editor diffs, typing, chat, and online user status.
- **Database (MongoDB):** users, rooms, membership, messages, and session metadata.
- **Code Execution Service (Judge0 placeholder):** receives execution requests and returns results to participants.

## Data Flow Overview

1. User authenticates (placeholder JWT flow).
2. User creates/joins a room via API.
3. Room clients connect to Socket.IO room namespace/channel.
4. Monaco edits are broadcast to room participants in near real time.
5. Chat/presence events are emitted and persisted.
6. Code run requests are forwarded to Judge0 service wrapper and results are returned.

## Future Feature Roadmap

- CRDT/OT conflict-resolution strategy for robust concurrent editing.
- Role-based room permissions (owner/editor/viewer).
- Multi-language templates and test-case execution workflows.
- Replay mode for interview/session review.
- WebRTC voice/video integration for pair programming.
- Analytics dashboards for coding interview performance insights.
- Horizontal scaling with Redis adapter for multi-instance Socket.IO.
