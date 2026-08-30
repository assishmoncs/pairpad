import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/apiError';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import LanguageSelect from '../components/LanguageSelect';
import FormField from '../components/FormField';

import LoadingSpinner from '../components/LoadingSpinner';
import Logo from '../components/Logo';

const getRoomKey = (room) => room?._id || room?.roomCode;

const isSameRoom = (left, right) => {
  if (!left || !right) return false;
  return (
    (left._id && right._id && left._id === right._id) ||
    (left.roomCode && right.roomCode && left.roomCode === right.roomCode)
  );
};

export const upsertRoomAtTop = (roomList, room) => {
  if (!room) return roomList;
  return [room, ...roomList.filter((existingRoom) => !isSameRoom(existingRoom, room))];
};

const Dashboard = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomLanguage, setNewRoomLanguage] = useState(DEFAULT_LANGUAGE);
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [joining, setJoining] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await axios.get('/api/rooms');
      setRooms(response.data.data.rooms);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load rooms.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const response = await axios.post('/api/rooms', {
        name: newRoomName,
        language: newRoomLanguage,
        description: newRoomDescription,
      });

      setRooms((currentRooms) => upsertRoomAtTop(currentRooms, response.data.data.room));
      setShowCreateForm(false);
      setNewRoomName('');
      setNewRoomLanguage(DEFAULT_LANGUAGE);
      setNewRoomDescription('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create room.'));
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!joinRoomCode.trim()) return;
    setError('');
    setJoining(true);

    try {
      await axios.post(`/api/rooms/${joinRoomCode.trim()}/join`);
      navigate(`/room/${joinRoomCode.trim()}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to join room.'));
    } finally {
      setJoining(false);
    }
  };

  const handleNavigateToRoom = (roomCode) => {
    navigate(`/room/${roomCode}`);
  };

  if (loading) {
    return (
      <div className="dashboard loading">
        <LoadingSpinner label="Loading dashboard..." size="large" />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <Logo size={36} />
          <h1 style={{ margin: 0 }}>Welcome, {user?.name}!</h1>
        </div>
        <button onClick={logout} className="btn-secondary" aria-label="Logout">
          Logout
        </button>
      </header>

      {error && <div className="error-message" aria-live="polite">{error}</div>}

      <div className="dashboard-content">
        <div className="rooms-section">
          <div className="section-header">
            <h2>Your Rooms</h2>
            <div className="action-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setShowCreateForm(!showCreateForm);
                  setShowJoinForm(false);
                }}
                className="btn-primary"
                aria-label={showCreateForm ? 'Cancel Create Room' : 'Create Room'}
              >
                {showCreateForm ? 'Cancel' : 'Create Room'}
              </button>
              <button
                onClick={() => {
                  setShowJoinForm(!showJoinForm);
                  setShowCreateForm(false);
                }}
                className="btn-secondary"
              >
                {showJoinForm ? 'Cancel' : 'Join Room'}
              </button>
            </div>
          </div>

          {showJoinForm && (
            <form onSubmit={handleJoinByCode} className="join-room-form create-room-form">
              <FormField
                id="joinRoomCode"
                label="Room Code"
                value={joinRoomCode}
                onChange={setJoinRoomCode}
                placeholder="Enter room code (e.g. ABC123)"
                required
              />
              <button type="submit" disabled={joining} className="btn-primary">
                {joining ? 'Joining...' : 'Join Room'}
              </button>
            </form>
          )}

          {showCreateForm && (
            <form onSubmit={handleCreateRoom} className="create-room-form">
              <FormField
                id="roomName"
                label="Room Name"
                value={newRoomName}
                onChange={setNewRoomName}
                placeholder="Enter room name"
                required
              />

              <div className="form-group">
                <label htmlFor="language">Language</label>
                <LanguageSelect
                  value={newRoomLanguage}
                  onChange={(e) => setNewRoomLanguage(e.target.value)}
                />
              </div>

              <FormField
                id="description"
                label="Description (optional)"
                value={newRoomDescription}
                onChange={setNewRoomDescription}
                placeholder="Brief description"
                maxLength={200}
              />

              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Creating...' : 'Create Room'}
              </button>
            </form>
          )}

          {rooms.length === 0 ? (
            <p className="no-rooms">You don't have any rooms yet. Create one to get started!</p>
          ) : (
            <div className="rooms-list" role="list">
              {rooms.map((room) => (
                <article key={getRoomKey(room)} className="room-card" tabIndex="0" role="listitem">
                  <h3>{room.name}</h3>
                  <p className="room-code">
                    Code: <strong>{room.roomCode}</strong>
                  </p>
                  <p className="room-language">Language: {room.language}</p>
                  <p className="room-members">Members: {room.members?.length || 1}</p>
                  <div className="room-actions">
                    <button
                      onClick={() => handleNavigateToRoom(room.roomCode)}
                      className="btn-primary"
                    >
                      Open Room
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
