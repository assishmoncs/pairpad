import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoomMembersPanel from '../components/RoomMembersPanel';

vi.mock('axios', () => ({ default: { patch: vi.fn() } }));

describe('RoomMembersPanel', () => {
  const room = {
    roomCode: 'ABC123',
    owner: { _id: '1', name: 'Owner' },
    members: [
      { _id: '1', name: 'Owner' },
      { _id: '2', name: 'Editor' },
      { _id: '3', name: 'Viewer' },
    ],
    memberRoles: [
      { user: { _id: '1' }, role: 'owner' },
      { user: { _id: '2' }, role: 'editor' },
      { user: { _id: '3' }, role: 'viewer' },
    ],
  };

  test('shows role selectors to owner', () => {
    render(<RoomMembersPanel room={room} currentUserId="1" />);
    expect(screen.getByRole('combobox', { name: /role for editor/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /role for viewer/i })).toBeInTheDocument();
  });

  test('shows badges rather than controls to non-owner', () => {
    render(<RoomMembersPanel room={room} currentUserId="2" />);
    expect(screen.queryByRole('combobox', { name: /role for/i })).not.toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });
});
