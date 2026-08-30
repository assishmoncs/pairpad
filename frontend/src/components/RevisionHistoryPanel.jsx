import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './RevisionHistoryPanel.css';

const RevisionHistoryPanel = ({ roomCode, code, language, currentRole }) => {
  const [revisions, setRevisions] = useState([]);
  const [selectedRevision, setSelectedRevision] = useState(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`/api/rooms/${roomCode}/history?limit=50`);
      setRevisions(response.data.data.revisions || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load revision history.');
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const createCheckpoint = async () => {
    try {
      setError('');
      await axios.post(`/api/rooms/${roomCode}/history`, {
        content: code,
        language,
        message: message.trim() || 'Manual checkpoint',
      });
      setMessage('');
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create checkpoint.');
    }
  };

  const restore = async (revision) => {
    if (currentRole !== 'owner') return;
    if (!window.confirm(`Restore revision from ${new Date(revision.createdAt).toLocaleString()}?`)) return;

    setRestoring(true);
    setError('');
    try {
      await axios.post(`/api/rooms/${roomCode}/history/${revision._id}/restore`);
      setSelectedRevision(null);
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to restore revision.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="revision-history-panel sidebar-section">
      <div className="revision-header">
        <h3>History</h3>
        <button type="button" onClick={loadHistory} disabled={loading} className="revision-refresh" aria-label="Refresh revision history">
          {loading ? '…' : '↻'}
        </button>
      </div>

      {currentRole !== 'viewer' && (
        <div className="revision-checkpoint">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={120}
            placeholder="Checkpoint message (optional)"
            aria-label="Checkpoint message"
          />
          <button type="button" onClick={createCheckpoint}>Save</button>
        </div>
      )}

      {error && <div className="revision-error" role="alert">{error}</div>}

      <div className="revision-list">
        {revisions.map((revision) => {
          const authorName = revision.author?.name || 'Unknown user';
          const active = selectedRevision?._id === revision._id;
          return (
            <div key={revision._id} className={`revision-item ${active ? 'selected' : ''}`}>
              <button type="button" className="revision-main" onClick={() => setSelectedRevision(active ? null : revision)}>
                <span className="revision-message">{revision.message || 'Checkpoint'}</span>
                <span className="revision-meta">
                  {authorName} · {new Date(revision.createdAt).toLocaleString()} · {revision.source}
                </span>
              </button>
              {active && (
                <div className="revision-actions">
                  <span>{revision.language}</span>
                  {currentRole === 'owner' && (
                    <button type="button" onClick={() => restore(revision)} disabled={restoring}>
                      {restoring ? 'Restoring…' : 'Restore'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && revisions.length === 0 && <div className="revision-empty">No revisions yet.</div>}
      </div>
    </div>
  );
};

export default RevisionHistoryPanel;
