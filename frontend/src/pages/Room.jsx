import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import socketService from '../services/socketService';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/apiError';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import LanguageSelect from '../components/LanguageSelect';
import './Room.css';

const getUserId = (u) => (u?._id || u?.id || '').toString();
const getMessageKey = (message) => message?._id || null;

export const appendUniqueMessage = (messageList, message) => {
  const key = getMessageKey(message);
  if (!key || !messageList.some((existing) => getMessageKey(existing) === key)) {
    return [...messageList, message];
  }

  return messageList;
};

const Room = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  // ── Room data ──────────────────────────────────────────────────────────────
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingRoom, setDeletingRoom] = useState(false);

  // ── Socket / presence ─────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socketError, setSocketError] = useState('');

  // ── Editor ────────────────────────────────────────────────────────────────
  const [code, setCode] = useState('// Start coding together...\n');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState('');
  const editorRef = useRef(null);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const messagesEndRef = useRef(null);

  // ── Execution ─────────────────────────────────────────────────────────────
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionError, setExecutionError] = useState('');

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isRemoteChange = useRef(false);
  // Holds the unsubscribe function for all socket listeners registered for this
  // room session. Cleaned up before re-registering or on unmount.
  const socketCleanupRef = useRef(null);
  // Track whether this component is still mounted to avoid state updates after unmount.
  const isMountedRef = useRef(true);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  // Mark unmounted on teardown
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch room data whenever roomCode changes.
  // Full disconnect on cleanup so the socket is always torn down when leaving.
  useEffect(() => {
    fetchRoom();

    return () => {
      // Clean up socket listeners first
      if (socketCleanupRef.current) {
        socketCleanupRef.current();
        socketCleanupRef.current = null;
      }
      // Full disconnect when navigating away from this room page entirely
      socketService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Connect to the socket once the room is loaded and we have a token.
  // Cleans up listeners (but not the full socket) when room/token changes.
  useEffect(() => {
    if (!room || !token) return;

    connectToSocket();

    return () => {
      // Clean up listeners on re-run (room/token changed, StrictMode re-mount, etc.)
      if (socketCleanupRef.current) {
        socketCleanupRef.current();
        socketCleanupRef.current = null;
      }
      // Leave the socket room channel so the server removes us from presence,
      // but keep the physical socket alive for reuse on the next room.
      socketService.leaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, token]);

  // ── Socket setup ──────────────────────────────────────────────────────────

  /**
   * Set up all socket listeners and connect (or re-use an existing connection).
   *
   * CRITICAL ORDER: listeners MUST be registered before connect() is called so
   * the 'connect' event is never missed on fast / already-connected sockets.
   */
  const connectToSocket = async () => {
    // Guard against double-registration (React StrictMode, dependency re-runs)
    if (socketCleanupRef.current) {
      socketCleanupRef.current();
      socketCleanupRef.current = null;
    }

    setSocketError('');
    setReconnecting(false);

    // ── 1. Register all listeners BEFORE connect() ─────────────────────────

    // Connected (initial or after reconnect)
    const unsubConnect = socketService.on('connect', async () => {
      if (!isMountedRef.current) return;
      setConnected(true);
      setReconnecting(false);
      setSocketError('');

      // Re-join the room after a reconnect so presence is restored.
      // On the very first connect this is a no-op (joinRoom is called below).
      const currentRoom = socketService.getCurrentRoom();
      if (currentRoom) {
        try {
          const joinResponse = await socketService.joinRoom(currentRoom);
          if (isMountedRef.current && joinResponse.users) {
            setOnlineUsers(joinResponse.users);
          }
        } catch (err) {
          console.error('[Room] Failed to rejoin room on reconnect:', err.message);
          if (isMountedRef.current) {
            setSocketError('Reconnected, but could not rejoin room: ' + err.message);
          }
        }
      }
    });

    // Disconnected (may reconnect automatically)
    const unsubDisconnect = socketService.on('disconnect', ({ reason } = {}) => {
      if (!isMountedRef.current) return;
      setConnected(false);
      // Only show "Reconnecting" for transient drops; if it was intentional
      // (io client/server disconnect) we leave it as plain disconnected.
      const intentional =
        reason === 'io client disconnect' || reason === 'io server disconnect';
      setReconnecting(!intentional);
    });

    // Connection error (transient; socket keeps retrying)
    const unsubError = socketService.on('connect_error', ({ error: errMsg } = {}) => {
      if (!isMountedRef.current) return;
      console.warn('[Room] connect_error:', errMsg);
      // Don't override a successful connected state with an error badge
      // (error may fire in parallel with a successful reconnect).
    });

    // Presence updates from the server
    const unsubPresence = socketService.on('presence-update', ({ users }) => {
      if (!isMountedRef.current) return;
      setOnlineUsers(users || []);
    });

    // Remote code changes
    const unsubCodeChange = socketService.on(
      'code-change',
      ({ content, language: nextLanguage }) => {
        if (!isMountedRef.current) return;
        isRemoteChange.current = true;
        setCode(content);
        if (nextLanguage) {
          setLanguage(nextLanguage);
        }
        // Reset flag after the current render cycle
        setTimeout(() => {
          isRemoteChange.current = false;
        }, 0);
      }
    );

    // Incoming chat messages (deduplicated)
    const unsubChatMessage = socketService.on('chat-message', (message) => {
      if (!isMountedRef.current) return;
      setMessages((prev) => appendUniqueMessage(prev, message));
    });

    // Code execution results broadcast by the server
    const unsubExecutionResult = socketService.on(
      'code-execution-result',
      ({ result }) => {
        if (!isMountedRef.current) return;
        setExecutionResult(result);
        if (result.status !== 'success' && result.stderr) {
          setExecutionError(result.stderr);
        }
      }
    );

    const unsubRoomDeleted = socketService.on('room-deleted', () => {
      if (!isMountedRef.current) return;
      setSocketError('This room was deleted. Returning to dashboard…');
      navigate('/dashboard', { replace: true });
    });

    // Consolidated cleanup: unsubscribes all listeners above
    socketCleanupRef.current = () => {
      unsubConnect();
      unsubDisconnect();
      unsubError();
      unsubPresence();
      unsubCodeChange();
      unsubChatMessage();
      unsubExecutionResult();
      unsubRoomDeleted();
    };

    // ── 2. Connect (or reuse) AFTER listeners are in place ────────────────
    try {
      socketService.connect(token);

      await socketService.waitForConnection();

      if (!isMountedRef.current) return;
      setConnected(true);

      // ── 3. Join the room channel ─────────────────────────────────────────
      try {
        const joinResponse = await socketService.joinRoom(roomCode);
        if (isMountedRef.current && joinResponse.users) {
          setOnlineUsers(joinResponse.users);
        }
      } catch (joinError) {
        if (isMountedRef.current) {
          setSocketError('Failed to join room: ' + joinError.message);
        }
      }

      // ── 4. Load chat history ─────────────────────────────────────────────
      await fetchMessages();
    } catch (err) {
      console.error('[Room] Socket connection failed:', err.message);
      if (isMountedRef.current) {
        setSocketError('Could not connect to collaboration server. Retrying…');
        setReconnecting(true);
      }
    }
  };

  // ── Room data ─────────────────────────────────────────────────────────────

  const fetchRoom = async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomCode}`);
      const roomData = response.data.data.room;

      if (!isMountedRef.current) return;
      setRoom(roomData);
      setLanguage(roomData.language || DEFAULT_LANGUAGE);

      const currentId = getUserId(user);
      const isMember =
        roomData.members?.some((m) => getUserId(m) === currentId) ||
        getUserId(roomData.owner) === currentId;

      if (!isMember) {
        await axios.post(`/api/rooms/${roomCode}/join`);
        const updatedResponse = await axios.get(`/api/rooms/${roomCode}`);
        if (isMountedRef.current) {
          setRoom(updatedResponse.data.data.room);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(getErrorMessage(err, 'Failed to load room.'));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ── Chat history ──────────────────────────────────────────────────────────

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`/api/messages/room/${roomCode}`);
      if (!isMountedRef.current) return;
      setMessages(response.data.data.messages || []);
      setMessagesError('');
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('[Room] Failed to fetch messages:', err);
      setMessagesError(err.response?.data?.message || 'Failed to load chat history.');
    }
  };

  // ── Scroll to bottom on new messages ─────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  // ── Editor handlers ───────────────────────────────────────────────────────

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  const handleCodeChange = useCallback(
    async (value) => {
      setCode(value);

      if (isRemoteChange.current) return;

      setIsSaving(true);
      try {
        await socketService.sendCodeChange(value, language);
        setSyncError('');
      } catch (err) {
        console.error('[Room] Failed to send code change:', err);
        setSyncError(
          err.message || 'Failed to sync your changes. Collaborators may not see them.'
        );
      } finally {
        setIsSaving(false);
      }
    },
    [language]
  );

  // ── Chat send ─────────────────────────────────────────────────────────────

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sendingMessage) return;

    setSendingMessage(true);
    setMessagesError('');
    try {
      await socketService.sendChatMessage(newMessage.trim());
      setNewMessage('');
    } catch (err) {
      console.error('[Room] Failed to send message:', err);
      setMessagesError('Failed to send message: ' + (err.message || 'Unknown error'));
    } finally {
      setSendingMessage(false);
    }
  };

  // ── Room deletion ─────────────────────────────────────────────────────────

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
      if (isMountedRef.current) {
        setDeletingRoom(false);
      }
    }
  };

  // ── Code execution ────────────────────────────────────────────────────────

  const handleRunCode = async () => {
    setExecuting(true);
    setExecutionResult(null);
    setExecutionError('');

    try {
      const response = await axios.post('/api/execute', {
        source_code: code,
        language: language,
        roomCode: roomCode,
      });

      const result = response.data.data.result;
      setExecutionResult(result);

      if (result.status !== 'success' && result.stderr) {
        setExecutionError(result.stderr);
      }
    } catch (err) {
      console.error('[Room] Failed to execute code:', err);
      setExecutionError(getErrorMessage(err, 'Failed to execute code.'));
    } finally {
      setExecuting(false);
    }
  };

  // ── Render guards ─────────────────────────────────────────────────────────

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

  // ── Connection status badge ───────────────────────────────────────────────

  const connectionLabel = connected
    ? 'Connected'
    : reconnecting
      ? 'Reconnecting…'
      : 'Disconnected';

  const connectionClass = connected
    ? 'connected'
    : reconnecting
      ? 'reconnecting'
      : 'disconnected';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="room-page">
      <header className="room-header">
        <div className="header-left">
          <button onClick={() => navigate('/dashboard')} className="btn-back">
            Back to Dashboard
          </button>
          <h1>{room?.name}</h1>
        </div>
        <div className="header-actions">
          {isRoomOwner && (
            <button
              type="button"
              onClick={handleDeleteRoom}
              disabled={deletingRoom}
              className="btn-delete-room"
            >
              {deletingRoom ? 'Deleting…' : 'Delete Room'}
            </button>
          )}
          <div className="connection-status">
            <span className={`status-dot ${connectionClass}`}></span>
            <span>{connectionLabel}</span>
            {socketError && !connected && (
              <span className="error-text"> — {socketError}</span>
            )}
          </div>
        </div>
      
      </header>

      {error && <div className="room-alert error-text">{error}</div>}

      <div className="room-layout">
        <div className="editor-section">
          <div className="editor-toolbar">
            <div className="language-selector">
              <label htmlFor="language">Language:</label>
              <LanguageSelect
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
            {isSaving && <span className="saving-indicator">Syncing...</span>}
            {syncError && <span className="error-text">{syncError}</span>}
            <button
              onClick={handleRunCode}
              disabled={executing}
              className="btn-run"
            >
              {executing ? 'Running...' : 'Run Code'}
            </button>
          </div>

          <Editor
            height="calc(100% - 50px)"
            language={language}
            value={code}
            theme="vs-dark"
            onMount={handleEditorMount}
            onChange={handleCodeChange}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        <aside className="room-sidebar">
          <div className="sidebar-section presence-section">
            <h3>Online Users ({onlineUsers.length})</h3>
            <ul className="users-list">
              {onlineUsers.map((u) => (
                <li key={u.socketId || u.userId} className="user-item">
                  <span className="user-dot"></span>
                  {u.name || 'Anonymous'}
                </li>
              ))}
              {onlineUsers.length === 0 && (
                <li className="no-users">No other users online</li>
              )}
            </ul>
          </div>

          <div className="sidebar-section execution-section">
            <h3>Execution Output</h3>
            {executionError && (
              <div className="execution-error">
                <strong>Error:</strong> {executionError}
              </div>
            )}
            {executionResult && (
              <div className="execution-result">
                {executionResult.stdout && (
                  <div className="output-section">
                    <strong>Output:</strong>
                    <pre>{executionResult.stdout}</pre>
                  </div>
                )}
                {executionResult.stderr && !executionError && (
                  <div className="error-section">
                    <strong>Stderr:</strong>
                    <pre>{executionResult.stderr}</pre>
                  </div>
                )}
                <div className="execution-meta">
                  {executionResult.time && (
                    <span>Time: {executionResult.time}</span>
                  )}
                  {executionResult.memory && (
                    <span>Memory: {executionResult.memory}</span>
                  )}
                  <span>Status: {executionResult.status}</span>
                </div>
              </div>
            )}
            {!executionResult && !executionError && (
              <p className="no-output">Click "Run Code" to see output</p>
            )}
          </div>

          <div className="sidebar-section chat-section">
            <h3>Room Chat</h3>
            {messagesError && (
              <div className="chat-error error-text">{messagesError}</div>
            )}
            <div className="messages-container">
              {messages.map((msg, index) => (
                <div key={(msg._id || msg.id || index).toString()} className="message-item">
                  <div className="message-header">
                    <span className="message-sender">
                      {msg.sender?.name || 'Unknown'}
                    </span>
                    <span className="message-time">
                      {msg.createdAt
                        ? new Date(msg.createdAt).toLocaleTimeString()
                        : ''}
                    </span>
                  </div>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="chat-form">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                maxLength={1000}
                disabled={sendingMessage || !connected}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sendingMessage || !connected}
                className="btn-send"
              >
                {sendingMessage ? '...' : 'Send'}
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Room;
