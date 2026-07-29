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

const Room = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socketError, setSocketError] = useState('');

  const [code, setCode] = useState('// Start coding together...\n');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState('');
  const editorRef = useRef(null);
  const socketCleanupRef = useRef(null);

  const [messagesError, setMessagesError] = useState('');

  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionError, setExecutionError] = useState('');

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef(null);

  const isRemoteChange = useRef(false);

  useEffect(() => {
    fetchRoom();
    return () => {
      socketService.disconnect();
    };
  }, [roomCode]);

  useEffect(() => {
    if (room && token && !socketService.isConnected()) {
      connectToSocket();
    }
    return () => {
      if (socketCleanupRef.current) {
        socketCleanupRef.current();
        socketCleanupRef.current = null;
      }
      socketService.leaveRoom();
    };
  }, [room, token]);

  const fetchRoom = async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomCode}`);
      const roomData = response.data.data.room;
      setRoom(roomData);
      setLanguage(roomData.language || DEFAULT_LANGUAGE);

      const currentId = getUserId(user);
      const isMember =
        roomData.members?.some((m) => getUserId(m) === currentId) ||
        getUserId(roomData.owner) === currentId;

      if (!isMember) {
        await axios.post(`/api/rooms/${roomCode}/join`);
        const updatedResponse = await axios.get(`/api/rooms/${roomCode}`);
        setRoom(updatedResponse.data.data.room);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load room.'));
    } finally {
      setLoading(false);
    }
  };

  const connectToSocket = async () => {
    try {
      setSocketError('');

      socketService.connect(token);

      const unsubConnect = socketService.on('connect', () => {
        setConnected(true);
      });

      const unsubDisconnect = socketService.on('disconnect', () => {
        setConnected(false);
      });

      const unsubError = socketService.on('connect_error', ({ error: errMsg }) => {
        setSocketError(errMsg);
      });

      const unsubPresence = socketService.on('presence-update', ({ users }) => {
        setOnlineUsers(users || []);
      });

      const unsubCodeChange = socketService.on('code-change', ({ content }) => {
        isRemoteChange.current = true;
        setCode(content);
        setTimeout(() => {
          isRemoteChange.current = false;
        }, 0);
      });

      const unsubChatMessage = socketService.on('chat-message', (message) => {
        setMessages((prev) => [...prev, message]);
        scrollToBottom();
      });

      try {
        const joinResponse = await socketService.joinRoom(roomCode);
        if (joinResponse.users) {
          setOnlineUsers(joinResponse.users);
        }
      } catch (joinError) {
        setSocketError('Failed to join room: ' + joinError.message);
      }

      await fetchMessages();

      socketCleanupRef.current = () => {
        unsubConnect();
        unsubDisconnect();
        unsubError();
        unsubPresence();
        unsubCodeChange();
        unsubChatMessage();
      };
    } catch (error) {
      console.error('[Room] Socket connection error:', error);
      setSocketError('Failed to connect to collaboration server.');
    }
  };

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`/api/messages/room/${roomCode}`);
      setMessages(response.data.data.messages || []);
      setMessagesError('');
    } catch (error) {
      console.error('[Room] Failed to fetch messages:', error);
      setMessagesError(
        error.response?.data?.message || 'Failed to load chat history.'
      );
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  const handleCodeChange = useCallback(
    async (value) => {
      setCode(value);

      if (isRemoteChange.current) {
        return;
      }

      setIsSaving(true);
      try {
        await socketService.sendCodeChange(value, language);
        setSyncError('');
      } catch (error) {
        console.error('[Room] Failed to send code change:', error);
        setSyncError(
          error.message || 'Failed to sync your changes. Collaborators may not see them.'
        );
      } finally {
        setIsSaving(false);
      }
    },
    [language]
  );

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sendingMessage) return;

    setSendingMessage(true);
    try {
      await socketService.sendChatMessage(newMessage.trim());
      setNewMessage('');
    } catch (error) {
      console.error('[Room] Failed to send message:', error);
      setError('Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

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
    } catch (error) {
      console.error('[Room] Failed to execute code:', error);
      setExecutionError(getErrorMessage(error, 'Failed to execute code.'));
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    if (!connected) return;

    const unsubExecutionResult = socketService.on(
      'code-execution-result',
      ({ result }) => {
        setExecutionResult(result);
        if (result.status !== 'success' && result.stderr) {
          setExecutionError(result.stderr);
        }
      }
    );

    return () => {
      unsubExecutionResult();
    };
  }, [connected]);

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

  return (
    <div className="room-page">
      <header className="room-header">
        <div className="header-left">
          <button onClick={() => navigate('/dashboard')} className="btn-back">
            ← Back to Dashboard
          </button>
          <h1>{room?.name}</h1>
        </div>
        <div className="connection-status">
          <span
            className={`status-dot ${connected ? 'connected' : 'disconnected'}`}
          ></span>
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
          {socketError && <span className="error-text"> - {socketError}</span>}
        </div>
      </header>

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
              {executing ? 'Running...' : '▶ Run Code'}
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
                <li key={u.userId || u.socketId} className="user-item">
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
                <div key={msg._id || index} className="message-item">
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
