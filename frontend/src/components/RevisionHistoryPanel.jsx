import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './RevisionHistoryPanel.css';

const buildLineDiff = (fromText, toText) => {
  const fromLines = String(fromText || '').split('\n');
  const toLines = String(toText || '').split('\n');
  const rows = [];
  const max = Math.max(fromLines.length, toLines.length);
  for (let index = 0; index < max; index += 1) {
    const before = fromLines[index];
    const after = toLines[index];
    if (before === after) rows.push({ type: 'same', text: before ?? '' });
    else {
      if (before !== undefined) rows.push({ type: 'removed', text: before });
      if (after !== undefined) rows.push({ type: 'added', text: after });
    }
  }
  return rows;
};

const RevisionHistoryPanel = ({ roomCode, code, language, currentRole }) => {
  const [revisions, setRevisions] = useState([]);
  const [selectedRevision, setSelectedRevision] = useState(null);
  const [diff, setDiff] = useState(null);
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

  const compareWithPrevious = async (revision) => {
    const index = revisions.findIndex((item) => item._id === revision._id);
    const previous = revisions[index + 1];
    if (!previous) return;
    try {
      setError('');
      const response = await axios.get(
        `/api/rooms/${roomCode}/history/diff?from=${previous._id}&to=${revision._id}`
      );
      setDiff(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to compare revisions.');
    }
  };

  const restore = async (revision) => {
    if (currentRole !== 'owner') return;
    if (!window.confirm(`Restore revision from ${new Date(revision.createdAt).toLocaleString()}?`))
      return;

    setRestoring(true);
    setError('');
    try {
      await axios.post(`/api/rooms/${roomCode}/history/${revision._id}/restore`);
      setSelectedRevision(null);
      setDiff(null);
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
        <button
          type="button"
          onClick={loadHistory}
          disabled={loading}
          className="revision-refresh"
          aria-label="Refresh revision history"
        >
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
          <button type="button" onClick={createCheckpoint}>
            Save
          </button>
        </div>
      )}

      {error && (
        <div className="revision-error" role="alert">
          {error}
        </div>
      )}

      <div className="revision-list">
        {revisions.map((revision, index) => {
          const authorName = revision.author?.name || 'Unknown user';
          const active = selectedRevision?._id === revision._id;
          const hasPrevious = index < revisions.length - 1;
          return (
            <div key={revision._id} className={`revision-item ${active ? 'selected' : ''}`}>
              <button
                type="button"
                className="revision-main"
                onClick={() => setSelectedRevision(active ? null : revision)}
              >
                <span className="revision-message">{revision.message || 'Checkpoint'}</span>
                <span className="revision-meta">
                  {authorName} · {new Date(revision.createdAt).toLocaleString()} · {revision.source}
                </span>
              </button>
              {active && (
                <div className="revision-actions">
                  <span>{revision.language}</span>
                  <div className="revision-action-group">
                    {hasPrevious && (
                      <button type="button" onClick={() => compareWithPrevious(revision)}>
                        Compare
                      </button>
                    )}
                    {currentRole === 'owner' && (
                      <button type="button" onClick={() => restore(revision)} disabled={restoring}>
                        {restoring ? 'Restoring…' : 'Restore'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!loading && revisions.length === 0 && (
          <div className="revision-empty">No revisions yet.</div>
        )}
      </div>

      {diff && (
        <div className="revision-diff" aria-label="Revision diff">
          <div className="revision-diff-header">Revision comparison</div>
          <div className="revision-diff-body">
            {buildLineDiff(diff.from.content, diff.to.content).map((row, index) => (
              <pre key={`${row.type}-${index}`} className={`diff-line diff-${row.type}`}>
                {row.type === 'added' ? '+ ' : row.type === 'removed' ? '- ' : '  '}
                {row.text}
              </pre>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RevisionHistoryPanel;
