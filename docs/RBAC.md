# PairPad Room Roles

PairPad uses three room roles.

| Role | View | Edit | Execute | Manage members | Transfer ownership | Delete room |
|---|---:|---:|---:|---:|---:|---:|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | No | No | No |
| Viewer | Yes | No | No | No | No | No |

## Enforcement

Permissions are enforced independently at every trust boundary:

- REST room operations resolve the current user's persisted role.
- `/api/execute` requires owner/editor access.
- Socket.IO room joins require membership.
- Legacy `code-change` and current CRDT writes require owner/editor access.
- Cursor updates and chat require room membership.
- The frontend mirrors the same role model for UX, but the server remains authoritative.

## Migration

Rooms created before `memberRoles` existed remain usable. Existing non-owner members are treated as editors until an owner explicitly changes their role.

## Role changes

Owners can change a non-owner member with:

```http
PATCH /api/rooms/:roomCode/members/:userId/role
Content-Type: application/json
Authorization: Bearer <access-token>

{"role":"viewer"}
```

A successful change broadcasts `member-role-updated` to active room sockets. The affected client should switch to the corresponding permissions immediately.
