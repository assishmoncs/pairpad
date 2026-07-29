import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/health`);
        if (response.data && response.data.status === 'ok') {
          setBackendStatus('online');
        } else {
          setBackendStatus('offline');
        }
      } catch (error) {
        console.error('Backend health check failed:', error.message);
        setBackendStatus('offline');
      }
    };

    checkHealth();
  }, []);

  return (
    <div className="app-container">
      <h1>PairPad</h1>
      <p>Real-time Collaborative Coding Platform</p>
      
      <div className="status-card">
        <p>Backend: </p>
        <p className={backendStatus === 'online' ? 'status-online' : 'status-offline'}>
          {backendStatus === 'checking' ? 'Checking...' : backendStatus.toUpperCase()}
        </p>
      </div>
    </div>
  );
}
