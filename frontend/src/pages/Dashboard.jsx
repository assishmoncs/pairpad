import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomLanguage, setNewRoomLanguage] = useState('javascript');
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
      setError(err.response?.data?.message || 'Failed to load rooms.');
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
      setNewRoomLanguage('javascript');
      setNewRoomDescription('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create room.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (roomCode) => {
    try {
      await axios.post(`/api/rooms/${roomCode}/join`);
      navigate(`/room/${roomCode}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join room.');
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
              <div className="form-group">
                <label htmlFor="roomName">Room Name</label>
                <input
                  type="text"
                  id="roomName"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Enter room name"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="language">Language</label>
                <select
                  id="language"
                  value={newRoomLanguage}
                  onChange={(e) => setNewRoomLanguage(e.target.value)}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="c">C</option>
                  <option value="go">Go</option>
                  <option value="rust">Rust</option>
                  <option value="typescript">TypeScript</option>
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="description">Description (optional)</label>
                <input
                  type="text"
                  id="description"
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="Brief description"
                  maxLength={200}
                />
              </div>
              
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
