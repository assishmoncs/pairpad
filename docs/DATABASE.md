# PairPad Database Performance

## Sources of truth

- MongoDB is the durable source of room, message, revision, user, and persisted CRDT state.
- Redis is the shared live-state layer for distributed Socket.IO presence and active CRDT document state when configured.
- Redis state is ephemeral and expires; MongoDB remains the recovery source after restart or Redis loss.

## Query conventions

- Use `lean()` for read-only API responses where Mongoose document methods are not required.
- Project only fields required by the endpoint. Large `snapshotCode`/`crdtState` fields are excluded from dashboard room lists.
- Room messages and revisions use descending `createdAt` queries with bounded limits.
- Cursor timestamps are validated before reaching MongoDB.
- Room membership queries use the room/member indexes defined in `Room`.

## Important indexes

| Collection | Index | Purpose |
|---|---|---|
| rooms | `roomCode` unique | Fast room lookup and uniqueness |
| rooms | `{ members: 1, createdAt: -1 }` | Dashboard room list |
| rooms | `{ memberRoles.user: 1, createdAt: -1 }` | Role-aware membership lookup |
| messages | `{ room: 1, createdAt: -1 }` | Chat history pagination |
| revisions | `{ room: 1, createdAt: -1 }` | Revision history pagination |
| revisions | `{ room: 1, author: 1, createdAt: -1 }` | Author-scoped revision queries |

## Persistence consistency

Live CRDT operations are applied against the latest shared Redis state with an optimistic `WATCH`/transaction retry. Each successful operation is also scheduled for MongoDB persistence. This prevents two horizontally scaled backend instances from overwriting the live document with stale in-memory snapshots.

A restore replaces the live CRDT baseline and publishes the replacement state to Redis before connected clients receive the restore event.

## Operational guidance

- Monitor MongoDB slow queries and index usage in production.
- Keep message/revision limits bounded and paginate rather than loading entire histories.
- Set a finite Redis document TTL so abandoned rooms do not retain unlimited active state.
- Back up MongoDB independently of Redis.
- Do not treat Redis as the only durable copy of collaborative data.
