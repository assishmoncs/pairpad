# PairPad System Design

## High-Level Architecture

PairPad is a monorepo with a React + Vite frontend and a Node.js + Express backend. REST handles authentication, rooms, chat, and code execution. Socket.IO provides the authenticated real-time transport. A dependency-free sequence CRDT is the authoritative collaborative document model, while MongoDB persists its serialized state.

```text
Browser (React + Monaco)
        |
        | REST (/api/*) + Socket.IO
        v
Express + Socket.IO (Helmet + Rate Limiting)
        |
        +---- MongoDB (Users, Rooms, Messages, CRDT state)
        |
        +---- Judge0 API (Primary) / Local Node & Python Runner (Fallback)
```

## Core Components

### Frontend
- Auth pages and JWT client session handling
- Dashboard for creating and opening rooms
- Room page with Monaco editor, CRDT collaboration, remote cursors, presence, chat, stdin input, execution output, and room-code sharing
- `AuthContext` + Axios authorization defaults
- `SocketService` singleton for transport, reconnection, room state, and event bus behavior
- `useCrdtCollaboration` owns the local CRDT and converts editor replacements into mergeable operations
- `useRemoteCursors` owns Monaco decoration lifecycle for collaborator cursors and selections

### Backend API
- Security headers via Helmet and endpoint rate limiting
- JWT authentication and room membership validation
- Room lifecycle and ownership operations
- MongoDB-backed chat history
- Judge0 execution wrapper with guarded local fallback
- Centralized errors, request IDs, structured logging, and probes

### Realtime Layer (Socket.IO)
- JWT required on handshake
- Room membership verified before collaboration operations are accepted
- Current clients use `crdt-sync-request` and `crdt-operation` for code synchronization
- Cursor updates are validated server-side and relayed to room peers without exposing socket internals
- Presence remains in-memory and is explicitly cleared on disconnect/leave
- Client cursor events are throttled to reduce event pressure while keeping UI responsive

### CRDT Layer
Each visible character is represented by a stable logical ID plus an insertion anchor. Deletes are represented as tombstones rather than physical removal. Concurrent insertions at the same anchor use deterministic ID ordering, so replicas converge after receiving the same set of operations.

The server keeps one CRDT instance per active room and persists the serialized state to `Room.crdtState`. It also maintains `snapshotCode` as a compatibility representation for older clients and easy recovery.

### Cursor Layer
Cursor state is ephemeral and is not stored in MongoDB. Each connected client publishes its current Monaco cursor position and optional selection. The server validates the coordinates and room membership, then forwards the normalized event to other room members.

The frontend assigns each user a deterministic visual color from a shared palette. Remote cursors are rendered using Monaco decorations, including a caret indicator, selection highlight, overview-ruler marker, and collaborator name in the hover message. Cursor state is removed when a user leaves or the socket disconnects.

## Collaboration Data Flow

1. User authenticates and opens a room.
2. Socket.IO authenticates the JWT and verifies room membership.
3. The client joins the room using the existing `join-room` flow.
4. The CRDT hook requests the authoritative room state using `crdt-sync-request`.
5. Monaco becomes editable only after the state is loaded.
6. Local editor changes become CRDT replace operations containing insert nodes and tombstone IDs.
7. The server validates membership and payload size, merges the operation, broadcasts it to peers, and schedules persistence.
8. Peers apply the operation to their local CRDT and render the converged text.
9. Monaco cursor/selection changes are throttled client-side, validated server-side, and rendered as remote decorations on peers.
10. Reconnects clear stale remote cursors, rejoin the room, and request fresh CRDT state.

## Production Hardening

- Centralized error handling with machine-readable error codes and request IDs
- Structured development/production logging
- `/health` liveness and `/ready` DB readiness probes
- Per-IP and per-event Socket.IO rate controls
- JWT-authenticated sockets and membership enforcement
- Debounced MongoDB persistence for CRDT state
- Server-side cursor validation and client-side cursor throttling
- GitHub Actions quality gates and CodeQL security analysis
- Docker-based deployment foundation

## Current Limitations

- Presence is in-memory; Redis is still required for multi-instance Socket.IO deployments.
- Character-level CRDT operations are intentionally simple and may use more metadata than production-grade binary CRDT formats.
- Authentication hardening, isolated execution workers, revision history, RBAC, and E2E testing remain on the roadmap.

## Roadmap

- Role-based permissions (owner / editor / viewer)
- Session replay and historical revisions
- Redis adapter for horizontal Socket.IO scaling
- Isolated execution workers and Docker sandboxing
- Playwright E2E and adversarial security suites
- Interview tooling (timer, question packs, hidden test cases)
- Multi-file workspace
- Observability, performance, and accessibility gates
