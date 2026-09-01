import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import socketService from '../services/socketService';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import LoadingSpinner from '../components/LoadingSpinner';
import ChatPanel from '../components/ChatPanel';
import ExecutionPanel from '../components/ExecutionPanel';
import LanguageSelect from '../components/LanguageSelect';
import RoomMembersPanel from '../components/RoomMembersPanel';
import RevisionHistoryPanel from '../components/RevisionHistoryPanel';
import InterviewPanel from '../components/InterviewPanel';
import WorkspaceFilesPanel from '../components/WorkspaceFilesPanel';
import ConnectionBanner from '../components/ConnectionBanner';
import { useCollaboration } from '../hooks/useCollaboration';
import { useCrdtCollaboration } from '../hooks/useCrdtCollaboration';
import { useChat } from '../hooks/useChat';
import { useCodeExecution } from '../hooks/useCodeExecution';
import { useRemoteCursors } from '../hooks/useRemoteCursors';
import { useRoomShortcuts } from '../hooks/useRoomShortcuts';
import './Room.css';
import '../styles/workspaceUx.css';
import '../styles/workspaceFiles.css';

const idOf = (value) => String(value?._id || value?.id || value || '');

export default function RoomCollaborative() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [room, setRoom] = useState(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeFile, setActiveFile] = useState(null);
  const [switchingFile, setSwitchingFile] = useState(false);

  const mounted = useRef(true);
  const cursorDisposables = useRef([]);
  const cursorTimer = useRef(null);
  const pendingCursor = useRef(null);

  const chat = useChat({ roomCode });
  const execution = useCodeExecution({ code, language, roomCode });

  const handleRoleUpdated = useCallback(
    (role, userId) => {
      if (!userId || userId === idOf(user)) {
        setRoom((current) => (current ? { ...current, currentUserRole: role } : current));
      }
    },
    [user]
  );

  const collaboration = useCollaboration({
    room,
    token,
    roomCode,
    isMountedRef: mounted,
    onRemoteCode: () => {},
    onRoomDeleted: () => navigate('/dashboard', { replace: true }),
    onChatIncoming: chat.handleIncomingMessage,
    onExecutionResult: ({ result }) => {
      execution.setExecutionResult(result);
      if (result.status !== 'success' && result.stderr) {
        execution.setExecutionError(result.stderr);
      }
    },
    onRoleUpdated: handleRoleUpdated,
    fetchMessages: chat.fetchMessages,
  });

  const crdt = useCrdtCollaboration({
    room,
    roomCode,
    fileId: activeFile?._id || null,
    enabled: Boolean(activeFile),
    fallbackText: activeFile?.snapshotCode || '',
    onChange: setCode,
    onDocumentRestored: useCallback(({ language: restoredLanguage }) => {
      if (restoredLanguage) setLanguage(restoredLanguage);
    }, []),
  });

  useRemoteCursors(editor, collaboration.remoteCursors);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cursorDisposables.current.forEach((dispose) => dispose());
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    };
  }, []);

  const loadRoom = useCallback(async () => {
    mounted.current = true;
    setError('');
    try {
      const response = await axios.get(`/api/rooms/${roomCode}`);
      const data = response.data.data.room;
      if (!mounted.current) return;
      setRoom(data);
      setLanguage(data.language || DEFAULT_LANGUAGE);
    } catch (err) {
      if (mounted.current) {
        setError(err.response?.data?.message || 'Failed to load room.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    mounted.current = true;
    loadRoom();
    return () => {
      collaboration.cleanupListeners();
      socketService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const selectFile = useCallback(
    async (file) => {
      if (!file || String(activeFile?._id) === String(file._id)) return;
      setSwitchingFile(true);
      setError('');
      try {
        const response = await axios.get(`/api/rooms/${roomCode}/files/${file._id}`);
        const loaded = response.data.data.file;
        if (!mounted.current) return;
        setActiveFile(loaded);
        setLanguage(loaded.language || DEFAULT_LANGUAGE);
        setCode(typeof loaded.snapshotCode === 'string' ? loaded.snapshotCode : '');
      } catch (err) {
        if (mounted.current) {
          setError(err.response?.data?.message || 'Failed to load file.');
        }
      } finally {
        if (mounted.current) setSwitchingFile(false);
      }
    },
    [activeFile?._id, roomCode]
  );

  const sendCursor = useCallback(() => {
    cursorTimer.current = null;
    const payload = pendingCursor.current;
    pendingCursor.current = null;
    if (payload) socketService.sendCursorUpdate(payload.position, payload.selection);
  }, []);

  const queueCursor = useCallback(
    (instance) => {
      if (!socketService.isConnected()) return;
      const position = instance.getPosition();
      if (!position) return;
      const selection = instance.getSelection();
      pendingCursor.current = {
        position: { line: position.lineNumber, column: position.column },
        selection: selection
          ? {
              startLineNumber: selection.startLineNumber,
              startColumn: selection.startColumn,
              endLineNumber: selection.endLineNumber,
              endColumn: selection.endColumn,
            }
          : null,
      };
      if (!cursorTimer.current) cursorTimer.current = setTimeout(sendCursor, 50);
    },
    [sendCursor]
  );

  const onEditorMount = useCallback(
    (instance) => {
      setEditor(instance);
      cursorDisposables.current.forEach((dispose) => dispose());
      cursorDisposables.current = [
        instance.onDidChangeCursorPosition(() => queueCursor(instance)),
        instance.onDidChangeCursorSelection(() => queueCursor(instance)),
      ];
      queueCursor(instance);
    },
    [queueCursor]
  );

  const currentRole =
    room?.currentUserRole || (idOf(room?.owner) === idOf(user) ? 'owner' : 'editor');
  const canEdit = currentRole === 'owner' || currentRole === 'editor';
  const isOwner = currentRole === 'owner';

  const copyRoomCode = useCallback(async () => {
    if (!room?.roomCode) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Clipboard access is unavailable. Copy the room code manually.');
    }
  }, [room?.roomCode]);

  const handleFileChanged = useCallback((file) => {
    if (!file) return;
    setActiveFile((current) =>
      current && String(current._id) === String(file._id) ? { ...current, ...file } : current
    );
  }, []);

  const deleteRoom = async () => {
    if (!room || !isOwner) return;
    if (
      !window.confirm(
        `Delete room "${room.name}"? This permanently removes the room and its chat history.`
      )
    )
      return;
    try {
      await axios.delete(`/api/rooms/${room.roomCode || roomCode}`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete room.');
    }
  };

  const connectToSocket = collaboration.connectToSocket;
  const retryConnection = useCallback(() => {
    if (token) connectToSocket();
  }, [token, connectToSocket]);

  useRoomShortcuts({
    onRun: () => {
      if (canEdit && crdt.crdtReady && !execution.executing) execution.handleRunCode();
    },
    onCopyRoomCode: copyRoomCode,
    onToggleFocusMode: () => setFocusMode((value) => !value),
    enabled: !loading,
  });

  if (loading) {
    return (
      <div className="room-page loading">
        <LoadingSpinner label="Connecting to collaboration room..." size="large" />
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="room-page error">
        <h2>We couldn't open this room</h2>
        <p>{error}</p>
        <div className="app-state-actions">
          <button type="button" onClick={loadRoom} className="btn-primary">
            Try again
          </button>
          <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`room-page${focusMode ? ' focus-mode' : ''}`}>
      <header className="room-header">
        <div className="header-left">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn-back"
            aria-label="Back to Dashboard"
          >
            ← Dashboard
          </button>
          <h1 className="room-title">{room?.name}</h1>
          {activeFile && (
            <span className="active-file-badge" title="Active workspace file">
              {activeFile.path}
            </span>
          )}
          <span className={`role-badge role-${currentRole}`}>{currentRole}</span>
          <button
            className="btn-room-code"
            type="button"
            onClick={copyRoomCode}
            aria-label={`Copy room code ${room?.roomCode}`}
          >
            {room?.roomCode}
            <span className="room-code-copy-hint">{copied ? ' ✓ Copied!' : ' · Copy'}</span>
          </button>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="workspace-help-button"
            onClick={() => setShowShortcuts((value) => !value)}
            aria-expanded={showShortcuts}
            aria-controls="workspace-shortcuts"
          >
            Shortcuts
          </button>
          <button
            type="button"
            className="workspace-help-button"
            onClick={() => setFocusMode((value) => !value)}
            aria-pressed={focusMode}
          >
            {focusMode ? 'Exit focus' : 'Focus mode'}
          </button>
          {isOwner && (
            <button type="button" onClick={deleteRoom} className="btn-delete-room">
              Delete Room
            </button>
          )}
          <div
            className="connection-status"
            aria-label={`Collaboration status: ${
              collaboration.connected
                ? 'connected'
                : collaboration.reconnecting
                  ? 'reconnecting'
                  : 'disconnected'
            }`}
          >
            <span
              className={`status-dot ${
                collaboration.connected
                  ? 'connected'
                  : collaboration.reconnecting
                    ? 'reconnecting'
                    : 'disconnected'
              }`}
            ></span>
            <span>
              {collaboration.connected
                ? 'Connected'
                : collaboration.reconnecting
                  ? 'Reconnecting…'
                  : 'Disconnected'}
            </span>
            {crdt.crdtReady && collaboration.connected && (
              <span className="crdt-status"> · Live CRDT</span>
            )}
          </div>
        </div>
      </header>

      {showShortcuts && (
        <div
          id="workspace-shortcuts"
          className="workspace-shortcuts"
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <h2>Keyboard shortcuts</h2>
          <dl>
            <dt>
              <kbd>Ctrl/Cmd</kbd> + <kbd>Enter</kbd>
            </dt>
            <dd>Run active file</dd>
            <dt>
              <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>
            </dt>
            <dd>Copy room code</dd>
            <dt>
              <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd>
            </dt>
            <dd>Toggle focus mode</dd>
          </dl>
        </div>
      )}

      <ConnectionBanner
        status={
          collaboration.connected
            ? 'connected'
            : collaboration.reconnecting
              ? 'reconnecting'
              : 'disconnected'
        }
        message={collaboration.socketError}
        onRetry={retryConnection}
      />
      {error && (
        <div className="room-alert error-text" aria-live="polite">
          {error}
        </div>
      )}
      {crdt.crdtError && (
        <div className="room-alert error-text" aria-live="polite">
          {crdt.crdtError}
        </div>
      )}

      <div className="room-layout">
        <div className="editor-section">
          <div className="editor-toolbar">
            <div className="language-selector">
              <label htmlFor="language">Language:</label>
              <LanguageSelect
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                aria-label="Select Editor Language"
                disabled={!canEdit || switchingFile}
              />
            </div>
            <span className="saving-indicator" aria-live="polite">
              {switchingFile
                ? 'Loading file…'
                : saving
                  ? 'Syncing…'
                  : crdt.crdtReady
                    ? `CRDT · ${currentRole}`
                    : activeFile
                      ? 'Initializing…'
                      : 'Select a file'}
            </span>
            <button
              type="button"
              onClick={execution.handleRunCode}
              disabled={execution.executing || !crdt.crdtReady || !canEdit || switchingFile}
              className="btn-run"
              title={canEdit ? 'Run active file (Ctrl/Cmd + Enter)' : 'View-only access'}
            >
              {execution.executing ? 'Running...' : canEdit ? 'Run File' : 'View Only'}
            </button>
          </div>

          {activeFile ? (
            <Editor
              height="calc(100% - 50px)"
              language={language}
              value={code}
              theme="vs-dark"
              loading={<LoadingSpinner label="Loading Monaco Editor..." />}
              onMount={onEditorMount}
              onChange={async (value) => {
                if (value === undefined || !crdt.crdtReady || !canEdit) return;
                setCode(value);
                setSaving(true);
                try {
                  await crdt.handleLocalChange(value);
                } finally {
                  if (mounted.current) setSaving(false);
                }
              }}
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                readOnly: !crdt.crdtReady || !canEdit || switchingFile,
                padding: { top: 8 },
                lineNumbersMinChars: 3,
              }}
            />
            <pre data-testid="collaborative-editor-content" hidden>
              {code}
            </pre>
          ) : (
            <div className="workspace-empty-editor">
              <h2>Select a file</h2>
              <p>Create or choose a workspace file to start coding.</p>
            </div>
          )}
        </div>

        <aside className="room-sidebar" aria-label="Room Sidebar">
          <WorkspaceFilesPanel
            roomCode={roomCode}
            currentRole={currentRole}
            activeFileId={activeFile?._id}
            onSelectFile={selectFile}
            onFileChanged={handleFileChanged}
          />
          <InterviewPanel
            roomCode={roomCode}
            room={room}
            currentRole={currentRole}
            code={code}
            language={language}
            onRoomUpdated={setRoom}
          />
          <div className="sidebar-section presence-section" aria-live="polite">
            <h3>Online Users ({collaboration.onlineUsers.length})</h3>
            {collaboration.onlineUsers.length ? (
              <ul className="users-list">
                {collaboration.onlineUsers.map((onlineUser) => (
                  <li key={onlineUser.socketId || onlineUser.userId} className="user-item">
                    <span className="user-dot"></span>
                    {onlineUser.name || 'Anonymous'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-users">No other collaborators online.</p>
            )}
          </div>
          <RoomMembersPanel room={room} currentUserId={idOf(user)} onRoomUpdated={setRoom} />
          <RevisionHistoryPanel
            roomCode={roomCode}
            code={code}
            language={language}
            currentRole={currentRole}
          />
          <ExecutionPanel
            executionResult={execution.executionResult}
            executionError={execution.executionError}
            showStdin={execution.showStdin}
            setShowStdin={execution.setShowStdin}
            stdin={execution.stdin}
            setStdin={execution.setStdin}
          />
          <ChatPanel
            messages={chat.messages}
            messagesError={chat.messagesError}
            newMessage={chat.newMessage}
            setNewMessage={chat.setNewMessage}
            sendingMessage={chat.sendingMessage}
            connected={collaboration.connected}
            handleSendMessage={chat.handleSendMessage}
            messagesEndRef={chat.messagesEndRef}
          />
        </aside>
      </div>
    </div>
  );
}
