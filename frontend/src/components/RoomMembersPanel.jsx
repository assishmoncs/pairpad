import React, { useMemo, useState } from 'react';
import axios from 'axios';

const roles = ['editor', 'viewer'];
const idOf = (user) => String(user?._id || user?.id || user || '');

export default function RoomMembersPanel({ room, currentUserId, onRoomUpdated }) {
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState('');

  const roleMap = useMemo(() => {
    const map = new Map();
    for (const entry of room?.memberRoles || []) {
      map.set(idOf(entry.user), entry.role);
    }
    if (room?.owner) map.set(idOf(room.owner), 'owner');
    return map;
  }, [room]);

  const isOwner = roleMap.get(String(currentUserId)) === 'owner' || idOf(room?.owner) === String(currentUserId);

  const updateRole = async (userId, role) => {
    setSavingUserId(userId);
    setError('');
    try {
      const response = await axios.patch(`/api/rooms/${room.roomCode}/members/${userId}/role`, { role });
      onRoomUpdated?.(response.data.data.room);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update member role.');
    } finally {
      setSavingUserId(null);
    }
  };

  const members = room?.members || [];

  return (
    <div className="sidebar-section members-section">
      <h3>Members ({members.length})</h3>
      {error && <div className="role-error" role="alert">{error}</div>}
      <ul className="users-list">
        {members.map((member) => {
          const memberId = idOf(member);
          const role = roleMap.get(memberId) || 'editor';
          const isCurrentUser = memberId === String(currentUserId);
          return (
            <li key={memberId} className="member-role-row">
              <div className="member-role-identity">
                <span className="user-dot"></span>
                <span>{member.name || 'Anonymous'}{isCurrentUser ? ' (you)' : ''}</span>
              </div>
              {isOwner && role !== 'owner' ? (
                <select
                  value={role}
                  disabled={savingUserId === memberId}
                  onChange={(event) => updateRole(memberId, event.target.value)}
                  aria-label={`Role for ${member.name || 'member'}`}
                >
                  {roles.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <span className={`role-badge role-${role}`}>{role}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
