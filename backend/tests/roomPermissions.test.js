const { ROLES, getMemberRole, canEdit, canManageMembers } = require('../src/utils/roomPermissions');

describe('room permissions', () => {
  const owner = '64f000000000000000000001';
  const editor = '64f000000000000000000002';
  const viewer = '64f000000000000000000003';
  const room = {
    owner,
    members: [owner, editor, viewer],
    memberRoles: [
      { user: owner, role: ROLES.OWNER },
      { user: editor, role: ROLES.EDITOR },
      { user: viewer, role: ROLES.VIEWER },
    ],
  };

  test('resolves all roles', () => {
    expect(getMemberRole(room, owner)).toBe(ROLES.OWNER);
    expect(getMemberRole(room, editor)).toBe(ROLES.EDITOR);
    expect(getMemberRole(room, viewer)).toBe(ROLES.VIEWER);
    expect(getMemberRole(room, 'missing')).toBeNull();
  });

  test('editor and owner can edit, viewer cannot', () => {
    expect(canEdit(getMemberRole(room, owner))).toBe(true);
    expect(canEdit(getMemberRole(room, editor))).toBe(true);
    expect(canEdit(getMemberRole(room, viewer))).toBe(false);
  });

  test('only owner can manage members', () => {
    expect(canManageMembers(getMemberRole(room, owner))).toBe(true);
    expect(canManageMembers(getMemberRole(room, editor))).toBe(false);
    expect(canManageMembers(getMemberRole(room, viewer))).toBe(false);
  });

  test('legacy members remain editors', () => {
    const legacyRoom = { owner, members: [owner, editor] };
    expect(getMemberRole(legacyRoom, editor)).toBe(ROLES.EDITOR);
  });
});
