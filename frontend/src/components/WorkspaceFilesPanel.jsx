import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import socketService from '../services/socketService';

const iconFor = (path = '') => {
  const ext = path.split('.').pop()?.toLowerCase();
  return (
    {
      js: 'JS',
      ts: 'TS',
      py: 'PY',
      java: 'JV',
      cpp: 'C++',
      c: 'C',
      go: 'GO',
      rs: 'RS',
      php: 'PHP',
      rb: 'RB',
    }[ext] || 'FILE'
  );
};

export default function WorkspaceFilesPanel({
  roomCode,
  currentRole,
  activeFileId,
  onSelectFile,
  onFileChanged,
}) {
  const [files, setFiles] = useState([]);
  const [newPath, setNewPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canEdit = ['owner', 'editor'].includes(currentRole);

  const loadFiles = React.useCallback(async () => {
    setError('');
    try {
      const response = await axios.get(`/api/rooms/${roomCode}/files`);
      const nextFiles = response.data.data.files || [];
      setFiles(nextFiles);
      if (!activeFileId && nextFiles[0]) onSelectFile(nextFiles[0]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load workspace files.');
    } finally {
      setLoading(false);
    }
  }, [roomCode, activeFileId, onSelectFile]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    const created = (payload = {}) => {
      if (!payload.file) return;
      setFiles((current) =>
        [
          ...current.filter((file) => String(file._id) !== String(payload.file._id)),
          payload.file,
        ].sort((a, b) => a.path.localeCompare(b.path))
      );
    };
    const renamed = (payload = {}) => {
      if (!payload.file) return;
      setFiles((current) =>
        current
          .map((file) => (String(file._id) === String(payload.file._id) ? payload.file : file))
          .sort((a, b) => a.path.localeCompare(b.path))
      );
    };
    const deleted = ({ fileId } = {}) => {
      if (!fileId) return;
      setFiles((current) => current.filter((file) => String(file._id) !== String(fileId)));
    };
    const subscriptions = [
      socketService.on('workspace-file-created', created),
      socketService.on('workspace-file-renamed', renamed),
      socketService.on('workspace-file-deleted', deleted),
    ];
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    if (activeFileId && !files.some((file) => String(file._id) === String(activeFileId)))
      onSelectFile(files[0] || null);
  }, [activeFileId, files, onSelectFile]);

  const folders = useMemo(() => {
    const groups = new Map();
    files.forEach((file) => {
      const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder).push(file);
    });
    return [...groups.entries()];
  }, [files]);

  const createFile = async (event) => {
    event.preventDefault();
    if (!canEdit || !newPath.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await axios.post(`/api/rooms/${roomCode}/files`, { path: newPath.trim() });
      const file = response.data.data.file;
      setFiles((current) => [...current, file].sort((a, b) => a.path.localeCompare(b.path)));
      setNewPath('');
      onSelectFile(file);
      onFileChanged?.(file);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create file.');
    } finally {
      setBusy(false);
    }
  };

  const renameFile = async (file) => {
    if (!canEdit || busy) return;
    const nextPath = window.prompt('New file path', file.path);
    if (!nextPath || nextPath.trim() === file.path) return;
    setBusy(true);
    setError('');
    try {
      const response = await axios.patch(`/api/rooms/${roomCode}/files/${file._id}`, {
        path: nextPath.trim(),
      });
      const updated = response.data.data.file;
      setFiles((current) =>
        current
          .map((entry) => (String(entry._id) === String(updated._id) ? updated : entry))
          .sort((a, b) => a.path.localeCompare(b.path))
      );
      if (String(activeFileId) === String(updated._id)) onSelectFile(updated);
      onFileChanged?.(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to rename file.');
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async (file) => {
    if (!canEdit || busy) return;
    if (!window.confirm(`Delete ${file.path}?`)) return;
    setBusy(true);
    setError('');
    try {
      await axios.delete(`/api/rooms/${roomCode}/files/${file._id}`);
      const remaining = files.filter((entry) => String(entry._id) !== String(file._id));
      setFiles(remaining);
      if (String(activeFileId) === String(file._id)) onSelectFile(remaining[0] || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-files-panel" aria-label="Workspace files">
      <div className="workspace-panel-heading">
        <h3>Files</h3>
        <span>{files.length}</span>
      </div>
      {canEdit && (
        <form className="file-create-form" onSubmit={createFile}>
          <input
            aria-label="New file path"
            value={newPath}
            onChange={(event) => setNewPath(event.target.value)}
            placeholder="src/helper.cpp"
            maxLength={240}
          />
          <button type="submit" disabled={busy || !newPath.trim()} aria-label="Create file">
            +
          </button>
        </form>
      )}
      {error && (
        <p className="workspace-file-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="workspace-file-empty">Loading files…</p>
      ) : !files.length ? (
        <p className="workspace-file-empty">No files yet.</p>
      ) : (
        <div className="workspace-file-tree">
          {folders.map(([folder, entries]) => (
            <div key={folder || '__root'} className="workspace-folder">
              {folder && <div className="workspace-folder-name">▾ {folder}</div>}
              {entries.map((file) => (
                <div
                  key={file._id}
                  className={`workspace-file-row${String(activeFileId) === String(file._id) ? ' active' : ''}`}
                >
                  <button
                    type="button"
                    className="workspace-file-select"
                    onClick={() => onSelectFile(file)}
                    aria-current={String(activeFileId) === String(file._id) ? 'page' : undefined}
                  >
                    <span className="workspace-file-icon">{iconFor(file.path)}</span>
                    <span className="workspace-file-name">
                      {folder ? file.path.slice(folder.length + 1) : file.path}
                    </span>
                  </button>
                  {canEdit && (
                    <div className="workspace-file-actions">
                      <button
                        type="button"
                        onClick={() => renameFile(file)}
                        aria-label={`Rename ${file.path}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFile(file)}
                        aria-label={`Delete ${file.path}`}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
