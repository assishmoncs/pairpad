import { act, renderHook, waitFor } from '@testing-library/react';
import { useCollaboration } from './useCollaboration';
import socketService from '../services/socketService';

vi.mock('../services/socketService', () => ({
  default: {
    on: vi.fn(),
    connect: vi.fn(),
    waitForConnection: vi.fn(),
    joinRoom: vi.fn(),
    getCurrentRoom: vi.fn(),
  },
}));

describe('collaboration reconnect', () => {
  let handlers;
  let currentRoom;
  let options;

  beforeEach(() => {
    handlers = new Map();
    currentRoom = null;
    socketService.on.mockImplementation((event, callback) => {
      handlers.set(event, callback);
      return () => handlers.delete(event);
    });
    socketService.connect.mockImplementation(() => {});
    socketService.waitForConnection.mockResolvedValue();
    socketService.getCurrentRoom.mockImplementation(() => currentRoom);
    socketService.joinRoom.mockImplementation(async () => {
      currentRoom = 'ABC123';
      return { role: 'editor', users: [] };
    });
    options = {
      room: { _id: 'room-1' },
      token: 'token',
      roomCode: 'ABC123',
      isMountedRef: { current: true },
      onRoleUpdated: vi.fn(),
      fetchMessages: vi.fn(),
    };
  });

  it('rejoins and refreshes messages after each transport reconnect', async () => {
    const { result } = renderHook(() => useCollaboration(options));
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(socketService.joinRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      currentRoom = null;
      handlers.get('disconnect')();
    });
    expect(result.current.connected).toBe(false);
    await act(async () => handlers.get('connect')());
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(socketService.joinRoom).toHaveBeenCalledTimes(2);
    expect(options.fetchMessages).toHaveBeenCalledTimes(2);
  });

  it('does not reconnect when room metadata or the current role changes', async () => {
    const { result, rerender } = renderHook((props) => useCollaboration(props), {
      initialProps: options,
    });
    await waitFor(() => expect(result.current.connected).toBe(true));
    rerender({ ...options, room: { ...options.room, currentUserRole: 'viewer' } });
    expect(socketService.connect).toHaveBeenCalledTimes(1);
  });
});
