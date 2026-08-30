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
import { useCollaboration } from '../hooks/useCollaboration';
import { useCrdtCollaboration } from '../hooks/useCrdtCollaboration';
import { useChat } from '../hooks/useChat';
import { useCodeExecution } from '../hooks/useCodeExecution';
import { useRemoteCursors } from '../hooks/useRemoteCursors';
import './Room.css';

const idOf = (value) => String(value?._id || value?.id || value || '');

export default function RoomCollaborative() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [room, setRoom] = useState(null);
  const [code, setCode] = useState('// Start coding together...\n');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  const cursorDisposables = useRef([]);
  const cursorTimer = useRef(null);
  const pendingCursor = useRef(null);

  const chat = useChat({ roomCode });
  const execution = useCodeExecution({ code, language, roomCode });
  const collaboration = useCollaboration({
    room, token, roomCode, isMountedRef: mounted,
    onRemoteCode: () => {},
    onRoomDeleted: () => navigate('/dashboard', { replace: true }),
    onChatIncoming: chat.handleIncomingMessage,
    onExecutionResult: ({ result }) => {
      execution.setExecutionResult(result);
      if (result.status !== 'success' && result.stderr) execution.setExecutionError(result.stderr);
    },
    fetchMessages: chat.fetchMessages,
  });
  const crdt = useCrdtCollaboration({ room, roomCode, enabled: true, fallbackText: code, onChange: setCode });
  useRemoteCursors(editor, collaboration.remoteCursors);

  useEffect(() => () => {
    mounted.current = false;
    cursorDisposables.current.forEach((dispose) => dispose());
    if (cursorTimer.current) clearTimeout(cursorTimer.current);
  }, []);

  const loadRoom = useCallback(async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomCode}`);
      const data = response.data.data.room;
      if (!mounted.current) return;
      setRoom(data);
      setLanguage(data.language || DEFAULT_LANGUAGE);
      if (data.snapshotCode) setCode(data.snapshotCode);
      const currentId = idOf(user);
      const member = data.members?.some((member) => idOf(member) === currentId) || idOf(data.owner) === currentId;
      if (!member) {
        await axios.post(`/api/rooms/${roomCode}/join`);
        const joined = await axios.get(`/api/rooms/${roomCode}`);
        if (mounted.current) setRoom(joined.data.data.room);
      }
    } catch (err) {
      if (mounted.current) setError(err.response?.data?.message || 'Failed to load room.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [roomCode, user]);

  useEffect(() => {
    loadRoom();
    return () => { collaboration.cleanupListeners(); socketService.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const sendCursor = useCallback(() => {
    cursorTimer.current = null;
    const payload = pendingCursor.current;
    pendingCursor.current = null;
    if (payload) socketService.sendCursorUpdate(payload.position, payload.selection);
  }, []);

  const queueCursor = useCallback((instance) => {
    if (!socketService.isConnected()) return;
    const position = instance.getPosition();
    if (!position) return;
    const selection = instance.getSelection();
    pendingCursor.current = {
      position: { line: position.lineNumber, column: position.column },
      selection: selection ? {
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn,
      } : null,
    };
    if (!cursorTimer.current) cursorTimer.current = setTimeout(sendCursor, 50);
  }, [sendCursor]);

  const onEditorMount = useCallback((instance) => {
    setEditor(instance);
    cursorDisposables.current.forEach((dispose) => dispose());
    cursorDisposables.current = [
      instance.onDidChangeCursorPosition(() => queueCursor(instance)),
      instance.onDidChangeCursorSelection(() => queueCursor(instance)),
    ];
    queueCursor(instance);
  }, [queueCursor]);

  const currentRole = room?.currentUserRole || (idOf(room?.owner) === idOf(user) ? 'owner' : 'editor');
  const canEdit = currentRole === 'owner' || currentRole === 'editor';
  const isOwner = currentRole === 'owner';

  const deleteRoom = async () => {
    if (!room || !isOwner) return;
    if (!window.confirm(`Delete room "${room.name}"? This permanently removes the room and its chat history.`)) return;
    try {
      await axios.delete(`/api/rooms/${room.roomCode || roomCode}`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete room.');
    }
  };

  if (loading) return <div className="room-page loading"><LoadingSpinner label="Connecting to collaboration room..." size="large" /></div>;
  if (error && !room) return <div className="room-page error"><h2>Error</h2><p>{error}</p><button onClick={() => navigate('/dashboard')} className="btn-primary">Back to Dashboard</button></div>;

  return <div className="room-page">
    <header className="room-header">
      <div className="header-left">
        <button onClick={() => navigate('/dashboard')} className="btn-back">← Dashboard</button>
        <h1>{room?.name}</h1>
        <span className={`role-badge role-${currentRole}`}>{currentRole}</span>
        <button className="btn-room-code" type="button" onClick={async () => { try { await navigator.clipboard.writeText(room.roomCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }} aria-label="Copy room code">{room?.roomCode}<span className="room-code-copy-hint">{copied ? ' ✓ Copied!' : ' · Copy'}</span></button>
      </div>
      <div className="header-actions">
        {isOwner && <button type="button" onClick={deleteRoom} className="btn-delete-room">Delete Room</button>}
        <div className="connection-status"><span className={`status-dot ${collaboration.connected ? 'connected' : collaboration.reconnecting ? 'reconnecting' : 'disconnected'}`}></span><span>{collaboration.connected ? 'Connected' : collaboration.reconnecting ? 'Reconnecting…' : 'Disconnected'}</span>{crdt.crdtReady && collaboration.connected && <span className="crdt-status"> · Live CRDT</span>}</div>
      </div>
    </header>

    {error && <div className="room-alert error-text" aria-live="polite">{error}</div>}
    {crdt.crdtError && <div className="room-alert error-text" aria-live="polite">{crdt.crdtError}</div>}

    <div className="room-layout">
      <div className="editor-section">
        <div className="editor-toolbar">
          <div className="language-selector"><label htmlFor="language">Language:</label><LanguageSelect value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Select Editor Language" disabled={!canEdit} /></div>
          <span className="saving-indicator" aria-live="polite">{saving ? 'Syncing…' : crdt.crdtReady ? `CRDT Sync · ${currentRole}` : 'Initializing…'}</span>
          <button onClick={execution.handleRunCode} disabled={execution.executing || !crdt.crdtReady || !canEdit} className="btn-run">{execution.executing ? 'Running...' : canEdit ? 'Run Code' : 'View Only'}</button>
        </div>
        <Editor
          height="calc(100% - 50px)"
          language={language}
          value={code}
          theme="vs-dark"
          loading={<LoadingSpinner label="Loading Monaco Editor..." />}
          onMount={onEditorMount}
          onChange={async (value) => {
            if (value === undefined || !crdt.crdtReady || !canEdit) return;
            setCode(value); setSaving(true);
            try { await crdt.handleLocalChange(value); } finally { if (mounted.current) setSaving(false); }
          }}
          options={{ minimap: { enabled: true }, fontSize: 14, automaticLayout: true, scrollBeyondLastLine: false, readOnly: !crdt.crdtReady || !canEdit }}
        />
      </div>

      <aside className="room-sidebar" aria-label="Room Sidebar">
        <div className="sidebar-section presence-section" aria-live="polite">
          <h3>Online Users ({collaboration.onlineUsers.length})</h3>
          <ul className="users-list">
            {collaboration.onlineUsers.map((onlineUser) => <li key={onlineUser.socketId || onlineUser.userId} className="user-item"><span className="user-dot"></span>{onlineUser.name || 'Anonymous'}</li>)}
          </ul>
        </div>
        <RoomMembersPanel room={room} currentUserId={idOf(user)} onRoomUpdated={setRoom} />
        <ExecutionPanel executionResult={execution.executionResult} executionError={execution.executionError} showStdin={execution.showStdin} setShowStdin={execution.setShowStdin} stdin={execution.stdin} setStdin={execution.setStdin} />
        <ChatPanel messages={chat.messages} messagesError={chat.messagesError} newMessage={chat.newMessage} setNewMessage={chat.setNewMessage} sendingMessage={chat.sendingMessage} connected={collaboration.connected} handleSendMessage={chat.handleSendMessage} messagesEndRef={chat.messagesEndRef} />
      </aside>
    </div>
  </div>;
}
