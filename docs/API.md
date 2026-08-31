# PairPad API Contract

PairPad's authoritative HTTP API contract is defined in `docs/openapi.yaml` using OpenAPI 3.1.

## Runtime endpoints

When the backend is running:

- `/api/openapi.yaml` serves the contract.
- `/api/docs` serves a lightweight human-readable API landing page.

## Authentication model

Authenticated requests use a short-lived Bearer access token. Refresh is performed through an HttpOnly refresh-token cookie that is rotated on every successful refresh. The API contract intentionally does not accept a refresh token in a JSON body.

## Consistency rules

The OpenAPI document is documentation, not the security boundary. The implementation remains authoritative for validation, authentication, authorization, rate limits, payload-size limits, room membership, and execution permissions.

## Interview Mode endpoints

- `GET /api/rooms/:roomCode/interview` — member-safe interview state; hidden tests are omitted for non-owners.
- `PUT /api/rooms/:roomCode/interview` — owner-only configuration.
- `POST /api/rooms/:roomCode/interview/start` — owner-only start.
- `POST /api/rooms/:roomCode/interview/pause` — owner-only pause.
- `POST /api/rooms/:roomCode/interview/resume` — owner-only resume.
- `POST /api/rooms/:roomCode/interview/end` — owner-only end.
- `POST /api/rooms/:roomCode/interview/submit` — editor/owner candidate submission with hidden-test redaction.

Socket.IO broadcasts `interview-updated` and `interview-state-changed` so open clients stay synchronized.

When changing an endpoint, update the implementation and `docs/openapi.yaml` in the same change, then run the backend contract tests.
