import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/apiError';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import LanguageSelect from '../components/LanguageSelect';
import FormField from '../components/FormField';

const Dashboard = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomLanguage, setNewRoomLanguage] = useState(DEFAULT_LANGUAGE);
  const [newRoomDescription, setNewRoomDescription] = useState('');
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
      
      setRooms([response.data.data.room, ...rooms]);
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

  const handleJoinRoom = async (roomCode) => {
    try {
      await axios.post(`/api/rooms/${roomCode}/join`);
      navigate(`/room/${roomCode}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to join room.'));
    }
  };

  const handleNavigateToRoom = (roomCode) => {
    navigate(`/room/${roomCode}`);
  };

  if (loading) {
    return <div className="dashboard loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Welcome, {user?.name}!</h1>
        <button onClick={logout} className="btn-secondary">Logout</button>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="dashboard-content">
        <div className="rooms-section">
          <div className="section-header">
            <h2>Your Rooms</h2>
            <button 
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="btn-primary"
            >
              {showCreateForm ? 'Cancel' : 'Create Room'}
            </button>
          </div>

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
            <div className="rooms-list">
              {rooms.map((room) => (
                <div key={room._id} className="room-card">
                  <h3>{room.name}</h3>
                  <p className="room-code">Code: <strong>{room.roomCode}</strong></p>
                  <p className="room-language">Language: {room.language}</p>
                  <p className="room-members">Members: {room.members?.length || 1}</p>
                  <div className="room-actions">
                    <button 
                      onClick={() => handleNavigateToRoom(room.roomCode)}
                      className="btn-primary"
                    >
                      Open
                    </button>
                    <button 
                      onClick={() => handleJoinRoom(room.roomCode)}
                      className="btn-secondary"
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
