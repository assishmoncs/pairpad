import { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socketService';
import { cursorColorForUser, cursorColorKeyForUser } from '../utils/cursor';

export const useCollaboration = ({
  room, token, roomCode, isMountedRef, onRemoteCode, onRoomDeleted,
  onChatIncoming, onExecutionResult, onRoleUpdated, fetchMessages,
}) => {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [socketError, setSocketError] = useState('');
  const socketCleanupRef = useRef(null);
  const isRemoteChangeRef = useRef(false);
  const lastRemoteCodeRef = useRef(null);

  const clearRemoteCursors = useCallback(() => setRemoteCursors({}), []);
  const cleanupListeners = useCallback(() => {
    socketCleanupRef.current?.();
    socketCleanupRef.current = null;
    clearRemoteCursors();
  }, [clearRemoteCursors]);

  const connectToSocket = useCallback(async () => {
    cleanupListeners();
    setSocketError('');
    setReconnecting(false);

    const unsubConnect = socketService.on('connect', async () => {
      if (!isMountedRef.current) return;
      setConnected(true); setReconnecting(false); setSocketError(''); clearRemoteCursors();
      const currentRoom = socketService.getCurrentRoom();
      if (currentRoom) {
        try {
          const response = await socketService.joinRoom(currentRoom);
          if (isMountedRef.current && response.users) setOnlineUsers(response.users);
          if (response.role) onRoleUpdated?.(response.role);
        } catch (err) {
          if (isMountedRef.current) setSocketError('Reconnected, but could not rejoin room: ' + err.message);
        }
      }
    });

    const unsubDisconnect = socketService.on('disconnect', ({ reason } = {}) => {
      if (!isMountedRef.current) return;
      setConnected(false); clearRemoteCursors();
      setReconnecting(reason !== 'io client disconnect' && reason !== 'io server disconnect');
    });
    const unsubPresence = socketService.on('presence-update', ({ users } = {}) => {
      if (!isMountedRef.current) return;
      const nextUsers = users || [];
      setOnlineUsers(nextUsers);
      const activeIds = new Set(nextUsers.map((entry) => String(entry.userId)));
      setRemoteCursors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(String(id)))));
    });
    const unsubUserLeft = socketService.on('user-left', ({ userId } = {}) => {
      if (!userId) return;
      setRemoteCursors((current) => {
        if (!current[userId]) return current;
        const next = { ...current }; delete next[userId]; return next;
      });
    });
    const unsubCursor = socketService.on('cursor-update', (payload = {}) => {
      if (!isMountedRef.current || !payload.userId) return;
      const userId = String(payload.userId);
      setRemoteCursors((current) => ({ ...current, [userId]: {
        userId, name: payload.userName || 'Collaborator', position: payload.position,
        selection: payload.selection || null, color: cursorColorForUser(userId), colorKey: cursorColorKeyForUser(userId),
      }}));
    });
    const unsubRole = socketService.on('member-role-updated', ({ userId, role } = {}) => {
      if (!userId || !role) return;
      onRoleUpdated?.(role, String(userId));
    });
    const unsubCode = socketService.on('code-change', ({ content, language }) => {
      if (!isMountedRef.current) return;
      isRemoteChangeRef.current = true; lastRemoteCodeRef.current = content;
      onRemoteCode({ content, language });
      setTimeout(() => { isRemoteChangeRef.current = false; }, 50);
    });
    const unsubChat = socketService.on('chat-message', onChatIncoming);
    const unsubExecution = socketService.on('code-execution-result', onExecutionResult);
    const unsubDeleted = socketService.on('room-deleted', () => { if (isMountedRef.current) onRoomDeleted(); });

    socketCleanupRef.current = () => {
      [unsubConnect, unsubDisconnect, unsubPresence, unsubUserLeft, unsubCursor, unsubRole, unsubCode, unsubChat, unsubExecution, unsubDeleted].forEach((fn) => fn());
    };

    try {
      socketService.connect(token);
      await socketService.waitForConnection();
      if (!isMountedRef.current) return;
      setConnected(true);
      const response = await socketService.joinRoom(roomCode);
      if (isMountedRef.current && response.users) setOnlineUsers(response.users);
      if (response.role) onRoleUpdated?.(response.role);
      await fetchMessages();
    } catch (err) {
      if (isMountedRef.current) { setSocketError('Could not connect to collaboration server. Retrying…'); setReconnecting(true); }
    }
  }, [cleanupListeners, clearRemoteCursors, token, roomCode, isMountedRef, onRemoteCode, onRoomDeleted, onChatIncoming, onExecutionResult, onRoleUpdated, fetchMessages]);

  useEffect(() => {
    if (!room || !token) return;
    connectToSocket();
    return () => { cleanupListeners(); socketService.leaveRoom(); };
  }, [room, token, connectToSocket, cleanupListeners]);

  return { connected, reconnecting, onlineUsers, remoteCursors, socketError, setSocketError, isRemoteChangeRef, lastRemoteCodeRef, connectToSocket, cleanupListeners };
};
