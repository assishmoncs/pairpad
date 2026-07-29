import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const Room = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchRoom();
  }, [roomCode]);

  const fetchRoom = async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomCode}`);
      setRoom(response.data.data.room);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load room.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setActionLoading(true);
    try {
      await axios.post(`/api/rooms/${roomCode}/join`);
      await fetchRoom();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join room.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="room-page loading">Loading room...</div>;
  }

  if (error && !room) {
    return (
      <div className="room-page error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const isMember = room?.members?.some(m => true); // Simplified for now

  return (
    <div className="room-page">
      <header className="room-header">
        <button onClick={() => navigate('/dashboard')} className="btn-back">
          ← Back to Dashboard
        </button>
        <h1>{room?.name}</h1>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="room-content">
        <div className="room-info">
          <div className="info-card">
            <h3>Room Details</h3>
            <p><strong>Room Code:</strong> {room?.roomCode}</p>
            <p><strong>Language:</strong> {room?.language}</p>
            <p><strong>Owner:</strong> {room?.owner?.name || 'Unknown'}</p>
            {room?.description && <p><strong>Description:</strong> {room.description}</p>}
          </div>

          <div className="info-card">
            <h3>Members ({room?.members?.length || 0})</h3>
            <ul className="members-list">
              {room?.members?.map((member, index) => (
                <li key={member._id || index}>
                  {member.name} {member.email && `(${member.email})`}
                  {room.owner?._id === member._id && ' (Owner)'}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="room-placeholder">
          <h2>Collaboration Coming Soon</h2>
          <p>Real-time code editing and collaboration features will be available in the next phase.</p>
          
          {!isMember && (
            <button 
              onClick={handleJoin} 
              disabled={actionLoading}
              className="btn-primary"
            >
              {actionLoading ? 'Joining...' : 'Join Room'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Room;
