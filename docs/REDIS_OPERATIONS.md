# Redis operations runbook

## Production settings

```env
REDIS_URL=rediss://:password@redis.example.com:6380
REDIS_REQUIRED=true
```

Use `rediss://` and authenticated Redis when traffic leaves a private trusted network.

## What Redis stores

PairPad uses Redis for:

- Socket.IO adapter pub/sub between backend instances.
- Ephemeral room presence leases.

MongoDB remains the source of truth for users, rooms, chat, revisions, and persisted CRDT state.

## Failure policy

With `REDIS_REQUIRED=true`, `/ready` returns HTTP 503 when Redis is unavailable, allowing a load balancer/orchestrator to stop routing traffic to an unhealthy instance.

With `REDIS_REQUIRED=false`, the backend can start without Redis and falls back to the single-node Socket.IO adapter and in-memory presence. This mode must not be presented as a consistent multi-instance deployment.

## Monitoring

Monitor:

- Redis connected clients
- command latency
- memory usage
- rejected connections
- pub/sub traffic
- keyspace growth under `pairpad:*`
- backend readiness failures

## Recovery

Redis data for `pairpad:presence:*` is disposable. If presence keys are lost, connected clients repopulate them through normal room joins/heartbeats. MongoDB-backed application data must not depend on Redis availability.
