import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import Room, { appendUniqueMessage } from './Room';
import socketService from '../services/socketService';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onMount }) => {
    React.useEffect(() => {
      onMount?.({});
    }, [onMount]);

    return <textarea aria-label="code editor" readOnly value={value} />;
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'user-1', name: 'Ada', email: 'ada@example.com' },
    token: 'room-token',
  }),
}));

vi.mock('../services/socketService', () => ({
  default: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => false),
    waitForConnection: vi.fn(() => Promise.resolve()),
    joinRoom: vi.fn(() => Promise.resolve({ users: [{ userId: 'user-1', name: 'Ada' }] })),
    leaveRoom: vi.fn(),
    on: vi.fn(() => vi.fn()),
    sendCodeChange: vi.fn(() => Promise.resolve({ success: true })),
    sendChatMessage: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

const roomWithoutMember = {
  _id: 'room-1',
  name: 'Interview Room',
  roomCode: 'ABC123',
  language: 'python',
  owner: { _id: 'user-2' },
  members: [{ _id: 'user-2' }],
};

const roomWithMember = {
  ...roomWithoutMember,
  members: [{ _id: 'user-1' }, { _id: 'user-2' }],
};

const renderRoom = () =>
  render(
    <MemoryRouter initialEntries={['/room/abc123']}>
      <Routes>
        <Route path="/room/:roomCode" element={<Room />} />
        <Route path="/dashboard" element={<h1>Dashboard route</h1>} />
      </Routes>
    </MemoryRouter>
  );

describe('appendUniqueMessage', () => {
  it('dedupes persisted messages by _id', () => {
    const first = { _id: 'msg-1', content: 'hello' };
    const duplicate = { _id: 'msg-1', content: 'hello again' };

    expect(appendUniqueMessage([first], duplicate)).toEqual([first]);
    expect(appendUniqueMessage([first], { _id: 'msg-2', content: 'second' })).toHaveLength(2);
  });

  it('handles messages without an _id safely', () => {
    const messageNoId = { content: 'transient' };
    expect(appendUniqueMessage([], messageNoId)).toEqual([messageNoId]);
  });
});

describe('Room loading', () => {
  it('auto-joins via REST when needed, waits for socket connection, and loads messages', async () => {
    axios.get.mockImplementation((url) => {
      if (url === '/api/rooms/abc123') {
        const hasJoined = axios.post.mock.calls.some(
          ([postUrl]) => postUrl === '/api/rooms/abc123/join'
        );
        return Promise.resolve({
          data: { data: { room: hasJoined ? roomWithMember : roomWithoutMember } },
        });
      }

      if (url === '/api/messages/room/abc123') {
        return Promise.resolve({
          data: {
            data: {
              messages: [
                {
                  _id: 'msg-1',
                  content: 'hello',
                  sender: { name: 'Ada' },
                  createdAt: '2026-07-29T00:00:00.000Z',
                },
              ],
            },
          },
        });
      }

      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
    axios.post.mockResolvedValue({ data: { data: { room: roomWithMember } } });

    renderRoom();

    expect(await screen.findByText('Interview Room')).toBeInTheDocument();
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith('/api/rooms/abc123/join');
    expect(socketService.connect).toHaveBeenCalledWith('room-token');
    expect(socketService.joinRoom).toHaveBeenCalledWith('abc123');
    expect(socketService.waitForConnection.mock.invocationCallOrder[0]).toBeLessThan(
      socketService.joinRoom.mock.invocationCallOrder[0]
    );
  });
});
