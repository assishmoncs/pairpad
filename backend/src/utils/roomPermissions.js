/**
 * Central room authorization policy.
 * Roles are persisted per room member and every layer should use these helpers
 * instead of duplicating role comparisons.
 */

const ROLES = Object.freeze({
  OWNER: 'owner',
  EDITOR: 'editor',
  VIEWER: 'viewer',
});

const ROLE_ORDER = Object.freeze({
  [ROLES.VIEWER]: 1,
  [ROLES.EDITOR]: 2,
  [ROLES.OWNER]: 3,
});

const normalizeRole = (role) => {
  const normalized = typeof role === 'string' ? role.toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(ROLE_ORDER, normalized)
    ? normalized
    : ROLES.VIEWER;
};

const getMemberRole = (room, userId) => {
  if (!room || !userId) return null;

  const requestedId = userId.toString();
  if (room.owner?.toString() === requestedId) return ROLES.OWNER;

  const member = (room.members || []).find((entry) => {
    const memberId = entry?.user?._id || entry?._id || entry?.userId;
    return memberId?.toString() === requestedId;
  });

  return member ? normalizeRole(member.role) : null;
};

const hasMinimumRole = (role, minimumRole) => {
  const current = normalizeRole(role);
  const minimum = normalizeRole(minimumRole);
  return ROLE_ORDER[current] >= ROLE_ORDER[minimum];
};

const canEdit = (role) => hasMinimumRole(role, ROLES.EDITOR);
const canView = (role) => hasMinimumRole(role, ROLES.VIEWER);
const canManageMembers = (role) => normalizeRole(role) === ROLES.OWNER;
const canDeleteRoom = (role) => normalizeRole(role) === ROLES.OWNER;
const canTransferOwnership = (role) => normalizeRole(role) === ROLES.OWNER;

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
