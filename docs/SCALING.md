# PairPad horizontal scaling

PairPad supports two Socket.IO deployment modes.

## Single-node development

Leave `REDIS_URL` unset. The server uses the in-process Socket.IO adapter and an in-memory presence fallback. This keeps local development simple.

## Multi-instance production

Set:

```env
REDIS_URL=redis://redis:6379
REDIS_REQUIRED=true
```

The backend connects to Redis before accepting traffic and installs the official Socket.IO Redis adapter. Socket.IO room broadcasts can then cross backend instances.

Presence is stored separately in Redis using expiring sorted-set entries. Each connection refreshes its presence lease every 30 seconds, and stale entries are removed after 90 seconds. The local map remains only as a development fallback.

Recommended topology:

```text
                Load Balancer
                      |
          +-----------+-----------+
          |                       |
     Backend #1              Backend #2
          |                       |
          +-----------+-----------+
                      |
                    Redis
                      |
                   MongoDB
```

## Requirements

- Use the same Redis instance/cluster for every backend process.
- Set a unique `PRESENCE_NODE_ID` per process or let the server generate one.
- Use TLS/authenticated Redis for deployments outside a trusted private network.
- Keep Redis private; clients must never connect directly to it.
- `REDIS_REQUIRED=true` makes readiness fail when Redis is unavailable.

## Failure behavior

When Redis is optional, a temporary Redis outage does not crash the backend. Socket.IO falls back to its local adapter and local presence, which is safe for one instance but not a valid multi-instance consistency guarantee. Production clusters should therefore use `REDIS_REQUIRED=true`.

## Validation

The final acceptance test should run two backend instances against the same MongoDB/Redis pair and verify that clients connected to different instances receive:

- room membership/presence changes
- CRDT operations
- chat messages
- role changes
- document restore events
- execution results
