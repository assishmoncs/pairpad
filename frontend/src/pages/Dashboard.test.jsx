import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import Dashboard, { upsertRoomAtTop } from './Dashboard';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'user-1', name: 'Ada', email: 'ada@example.com' },
    logout: vi.fn(),
  }),
}));

const existingRoom = {
  _id: 'room-1',
  name: 'Existing Room',
  roomCode: 'ABC123',
  language: 'javascript',
  members: [{ _id: 'user-1' }],
};

const renderDashboard = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/room/:roomCode" element={<h1>Room route</h1>} />
      </Routes>
    </MemoryRouter>
  );

describe('upsertRoomAtTop', () => {
  it('dedupes rooms by _id or roomCode', () => {
    const byId = upsertRoomAtTop([existingRoom], {
      ...existingRoom,
      name: 'Updated Room',
    });
    expect(byId).toEqual([{ ...existingRoom, name: 'Updated Room' }]);

    const byCode = upsertRoomAtTop([{ ...existingRoom, _id: undefined }], {
      _id: 'server-id',
      name: 'Same Code',
      roomCode: existingRoom.roomCode,
    });
    expect(byCode).toHaveLength(1);
    expect(byCode[0].name).toBe('Same Code');
  });
});

describe('Dashboard', () => {
  it('loads rooms and creates a room without duplicating an existing room', async () => {
    axios.get.mockResolvedValue({
      data: { data: { rooms: [existingRoom] } },
    });
    axios.post.mockResolvedValue({
      data: {
        data: {
          room: {
            ...existingRoom,
            name: 'Renamed Room',
          },
        },
      },
    });

    renderDashboard();

    expect(await screen.findByText('Existing Room')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /create room/i }));
    await userEvent.type(screen.getByLabelText(/room name/i), 'Renamed Room');

    const form = screen.getByRole('button', { name: /^create room$/i }).closest('form');
    await userEvent.click(within(form).getByRole('button', { name: /^create room$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/rooms', {
        name: 'Renamed Room',
        language: 'javascript',
        description: '',
      });
    });
    expect(await screen.findByText('Renamed Room')).toBeInTheDocument();
    expect(screen.queryByText('Existing Room')).not.toBeInTheDocument();
    expect(screen.getAllByText(/code:/i)).toHaveLength(1);
  });

  it('joins a room and navigates to the room route', async () => {
    axios.get.mockResolvedValue({
      data: { data: { rooms: [existingRoom] } },
    });
    axios.post.mockResolvedValue({ data: { data: {} } });

    renderDashboard();

    expect(await screen.findByText('Existing Room')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^join$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/rooms/ABC123/join');
    });
    expect(await screen.findByRole('heading', { name: /room route/i })).toBeInTheDocument();
  });
});
