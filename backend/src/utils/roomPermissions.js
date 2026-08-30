/** Central room authorization policy. */

const ROLES = Object.freeze({ OWNER: 'owner', EDITOR: 'editor', VIEWER: 'viewer' });
const ROLE_ORDER = Object.freeze({ viewer: 1, editor: 2, owner: 3 });

const normalizeRole = (role) => {
  const normalized = typeof role === 'string' ? role.toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(ROLE_ORDER, normalized) ? normalized : null;
};

const getMemberRole = (room, userId) => {
  if (!room || !userId) return null;
  const requestedId = userId.toString();
  const ownerId = (room.owner?._id || room.owner)?.toString();
  if (ownerId === requestedId) return ROLES.OWNER;

  const roleEntry = (room.memberRoles || []).find((entry) => {
    const memberId = entry?.user?._id || entry?.user || entry?.userId;
    return memberId?.toString() === requestedId;
  });
  if (roleEntry) return normalizeRole(roleEntry.role) || ROLES.EDITOR;

  const isLegacyMember = (room.members || []).some((member) => {
    const memberId = member?._id || member;
    return memberId?.toString() === requestedId;
  });
  return isLegacyMember ? ROLES.EDITOR : null;
};

const hasMinimumRole = (role, minimumRole) => {
  const current = normalizeRole(role) || ROLES.VIEWER;
  const minimum = normalizeRole(minimumRole) || ROLES.VIEWER;
  return ROLE_ORDER[current] >= ROLE_ORDER[minimum];
};

const canEdit = (role) => hasMinimumRole(role, ROLES.EDITOR);
const canView = (role) => role !== null;
const canManageMembers = (role) => (normalizeRole(role) || '') === ROLES.OWNER;
const canDeleteRoom = canManageMembers;
const canTransferOwnership = canManageMembers;

module.exports = {
  ROLES,
  ROLE_ORDER,
  normalizeRole,
  getMemberRole,
  hasMinimumRole,
  canEdit,
  canView,
  canManageMembers,
  canDeleteRoom,
  canTransferOwnership,
};
