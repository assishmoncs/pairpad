import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import socketService from '../services/socketService';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/apiError';
import { appendUniqueMessage } from '../utils/messages';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import LanguageSelect from '../components/LanguageSelect';
import LoadingSpinner from '../components/LoadingSpinner';
import Logo from '../components/Logo';
import ChatPanel from '../components/ChatPanel';
import ExecutionPanel from '../components/ExecutionPanel';
import { useCollaboration } from '../hooks/useCollaboration';
import { useCrdtCollaboration } from '../hooks/useCrdtCollaboration';
import { useChat } from '../hooks/useChat';
import { useCodeExecution } from '../hooks/useCodeExecution';
import './Room.css';

export { appendUniqueMessage };

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const getUserId = (u) => (u?._id || u?.id || '').toString();

const Room = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [code, setCode] = useState('// Start coding together...\n');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState('');
  const editorRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const chat = useChat({ roomCode });

  const {
    executing,
    stdin,
    setStdin,
    showStdin,
    setShowStdin,
    executionResult,
    executionError,
    setExecutionResult,
    setExecutionError,
    handleRunCode,
  } = useCodeExecution({ code, language, roomCode });

  const onRemoteCode = useCallback(({ content, language: nextLanguage }) => {
    setCode(content);
    if (nextLanguage) setLanguage(nextLanguage);
  }, []);

  const onRoomDeleted = useCallback(() => {
    if (!isMountedRef.current) return;
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  const onExecutionResult = useCallback(
    ({ result }) => {
      if (!isMountedRef.current) return;
      setExecutionResult(result);
      if (result.status !== 'success' && result.stderr) {
        setExecutionError(result.stderr);
      }
    },
    [setExecutionResult, setExecutionError]
  );

  const collaboration = useCollaboration({
    room,
    token,
    roomCode,
    isMountedRef,
    onRemoteCode,
    onRoomDeleted,
    onChatIncoming: chat.handleIncomingMessage,
    onExecutionResult,
    fetchMessages: chat.fetchMessages,
  });
  const { connected } = collaboration;

  const crdt = useCrdtCollaboration({
    room,
    roomCode,
    enabled: true,
    fallbackText: code,
    onChange: useCallback((nextText) => {
      setCode(nextText);
    }, []),
  });

  const fetchRoom = useCallback(async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomCode}`);
      const roomData = response.data.data.room;

      if (!isMountedRef.current) return;
      setRoom(roomData);
      setLanguage(roomData.language || DEFAULT_LANGUAGE);
      if (roomData.snapshotCode !== undefined && roomData.snapshotCode !== '') {
        setCode(roomData.snapshotCode);
      }

      const currentId = getUserId(user);
      const isMember =
        roomData.members?.some((m) => getUserId(m) === currentId) ||
        getUserId(roomData.owner) === currentId;

      if (!isMember) {
        await axios.post(`/api/rooms/${roomCode}/join`);
        const updatedResponse = await axios.get(`/api/rooms/${roomCode}`);
        if (isMountedRef.current) setRoom(updatedResponse.data.data.room);
      }
    } catch (err) {
      if (isMountedRef.current) setError(getErrorMessage(err, 'Failed to load room.'));
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [roomCode, user]);

  useEffect(() => {
    fetchRoom();

    return () => {
      collaboration.cleanupListeners();
      socketService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  const handleCodeChange = useCallback(
    async (value) => {
      if (!crdt.crdtReady) {
        // CRDT state must be authoritative before editing is permitted.
        return;
      }

      setCode(value);
      setIsSaving(true);
      try {
        await crdt.handleLocalChange(value);
        setSyncError(crdt.crdtError || '');
      } catch (err) {
        setSyncError(err.message || 'Failed to synchronize your changes.');
      } finally {
        setIsSaving(false);
      }
    },
    [crdt]
  );

  useEffect(() => {
    if (!crdt.crdtError) return;
    setSyncError(crdt.crdtError);
  }, [crdt.crdtError]);

  const isRoomOwner = getUserId(room?.owner) === getUserId(user);

  const handleDeleteRoom = async () => {
    if (!room || deletingRoom) return;

    const confirmed = window.confirm(
      `Delete room "${room.name}"? This permanently removes the room and its chat history.`
    );
    if (!confirmed) return;

    setDeletingRoom(true);
    setError('');
    try {
      await axios.delete(`/api/rooms/${room.roomCode || roomCode}`);
      socketService.leaveRoom();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete room.'));
    } finally {
      if (isMountedRef.current) setDeletingRoom(false);
    }
  };

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
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const connectionLabel = connected
    ? 'Connected'
    : collaboration.reconnecting
      ? 'Reconnecting…'
      : 'Disconnected';
  const connectionClass = connected
    ? 'connected'
    : collaboration.reconnecting
      ? 'reconnecting'
      : 'disconnected';

  const handleCopyRoomCode = async () => {
    const success = await copyToClipboard(room?.roomCode || roomCode);
    if (success) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="room-page">
      <header className="room-header">
        <div
          className="header-left"
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          <Logo size={28} showText={false} />
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary"
            aria-label="Back to Dashboard"
          >
            ← Dashboard
          </button>
          <h1 className="room-title">{room?.name}</h1>
          {room?.roomCode && (
            <button
              type="button"
              onClick={handleCopyRoomCode}
              className="btn-room-code"
              title="Click to copy room code"
              aria-label={`Copy room code ${room.roomCode}`}
            >
              {room.roomCode}
              <span className="room-code-copy-hint">{copiedCode ? ' ✓ Copied!' : ' · Copy'}</span>
            </button>
          )}
        </div>
        <div className="header-actions">
          {isRoomOwner && (
            <button
              type="button"
              onClick={handleDeleteRoom}
              disabled={deletingRoom}
              className="btn-delete-room"
              aria-label="Delete Room"
            >
              {deletingRoom ? 'Deleting…' : 'Delete Room'}
            </button>
          )}
          <div className="connection-status">
            <span className={`status-dot ${connectionClass}`}></span>
            <span>{connectionLabel}</span>
            {(collaboration.socketError || crdt.crdtError) && !connected && (
              <span className="error-text"> — {collaboration.socketError || crdt.crdtError}</span>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="room-alert error-text" aria-live="polite">
          {error}
        </div>
      )}

      <div className="room-layout">
        <div className="editor-section">
          <div className="editor-toolbar">
            <div className="language-selector">
              <label htmlFor="language">Language:</label>
              <LanguageSelect
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Select Editor Language"
              />
            </div>
            {!crdt.crdtReady && !crdt.crdtError && (
              <span className="saving-indicator" aria-live="polite">
                Initializing collaborative editor…
              </span>
            )}
            {crdt.crdtReady && (
              <span className="saving-indicator" aria-live="polite">
                CRDT Sync
              </span>
            )}
            {isSaving && (
              <span className="saving-indicator" aria-live="polite">
                Syncing...
              </span>
            )}
            {syncError && (
              <span className="error-text" aria-live="polite">
                {syncError}
              </span>
            )}
            <button
              onClick={handleRunCode}
              disabled={executing}
              className="btn-run"
              aria-label="Run Code"
            >
              {executing ? 'Running...' : 'Run Code'}
            </button>
          </div>

          <Editor
            height="calc(100% - 50px)"
            language={language}
            value={code}
            theme="vs-dark"
            loading={<LoadingSpinner label="Loading Monaco Editor..." />}
            onMount={handleEditorMount}
            onChange={handleCodeChange}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              readOnly: !crdt.crdtReady,
            }}
          />
        </div>

        <aside className="room-sidebar" aria-label="Room Sidebar">
          <div
            className="sidebar-section presence-section"
            aria-live="polite"
            aria-label="Online Users"
          >
            <h3>Online Users ({collaboration.onlineUsers.length})</h3>
            <ul className="users-list">
              {collaboration.onlineUsers.map((u) => (
                <li key={u.socketId || u.userId} className="user-item">
                  <span className="user-dot"></span>
                  {u.name || 'Anonymous'}
                </li>
              ))}
              {collaboration.onlineUsers.length === 0 && (
                <li className="no-users">No other users online</li>
              )}
            </ul>
          </div>

          <ExecutionPanel
            executionResult={executionResult}
            executionError={executionError}
            showStdin={showStdin}
            setShowStdin={setShowStdin}
            stdin={stdin}
            setStdin={setStdin}
          />

          <ChatPanel
            messages={chat.messages}
            messagesError={chat.messagesError}
            newMessage={chat.newMessage}
            setNewMessage={chat.setNewMessage}
            sendingMessage={chat.sendingMessage}
            connected={connected}
            handleSendMessage={chat.handleSendMessage}
            messagesEndRef={chat.messagesEndRef}
          />
        </aside>
      </div>
    </div>
  );
};

export default Room;
