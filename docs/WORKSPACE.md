# Multi-file Workspace

PairPad rooms now support multiple source files. Each workspace file is an independent persisted document with its own language, snapshot, and CRDT state.

## File operations

Authenticated room members can list and read files. Owners and editors can create, rename, and delete files. A workspace must always retain at least one file.

File paths are relative and may contain nested folders. Path traversal (`..`) and unsafe characters are rejected. File language is inferred from the extension when a language is not explicitly supplied.

## Collaboration

CRDT synchronization is keyed by `roomCode + fileId`, so editing one file does not overwrite another file's document state. Redis-backed deployments use the same file-scoped key for distributed collaboration.

## Migration

Existing single-file rooms are migrated lazily: the first workspace-file list creates `main.<extension>` and copies the legacy room snapshot/CRDT state into that file. The legacy room fields remain for backward compatibility during the migration period.

## REST endpoints

- `GET /api/rooms/:roomCode/files`
- `GET /api/rooms/:roomCode/files/:fileId`
- `POST /api/rooms/:roomCode/files`
- `PATCH /api/rooms/:roomCode/files/:fileId`
- `DELETE /api/rooms/:roomCode/files/:fileId`

## Limits

- Maximum file content: 512 KB.
- Maximum persisted CRDT state: 4 MB.
- Maximum relative path length: 240 characters.
- One file is always retained.
