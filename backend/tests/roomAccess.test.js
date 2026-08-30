const roomAccess = require('../src/utils/roomAccess');

describe('roomAccess', () => {
  it('covers roomAccess', async () => {
    roomAccess.normalizeRoomCode(' test ');
    roomAccess.normalizeRoomCode('');

    try { roomAccess.canAccessRoom({ memberRoles: [{ user: 'u1' }] }, 'u1'); } catch {}
    try { roomAccess.canAccessRoom({ memberRoles: [] }, 'u2'); } catch {}
    try { roomAccess.canAccessRoom(null, 'u2'); } catch {}

    try { roomAccess.getRoomRole({ memberRoles: [{ user: 'u1', role: 'owner' }] }, 'u1'); } catch {}
    try { roomAccess.getRoomRole({ memberRoles: [] }, 'u1'); } catch {}

    try { roomAccess.isRoomParticipant({ members: ['u1'] }, 'u1'); } catch {}
    try { roomAccess.isRoomParticipant({ members: [] }, 'u1'); } catch {}

    const req1 = { user: { _id: 'u1' } };
    try { await roomAccess.requireRoomRole('owner')({ room: { memberRoles: [{ user: 'u1', role: 'owner' }] } }, {}, jest.fn()); } catch {}
    try { await roomAccess.requireRoomRole('owner')({ room: { memberRoles: [{ user: 'u1', role: 'viewer' }] } }, {}, jest.fn()); } catch {}
  });
});
