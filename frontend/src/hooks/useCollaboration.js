import { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socketService';

export const useCollaboration = ({
  room,
  token,
  roomCode,
  isMountedRef,
  onRemoteCode,
  onRoomDeleted,
  onChatIncoming,
  onExecutionResult,
  onRoleUpdated,
  fetchMessages,
}) => {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [socketError, setSocketError] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState(new Map());
  const socketCleanupRef = useRef(() => {});
  const cursorExpiryTimersRef = useRef(new Map());

  const clearRemoteCursors = useCallback(() => {
    cursorExpiryTimersRef.current.forEach((timer) => clearTimeout(timer));
    cursorExpiryTimersRef.current.clear();
    setRemoteCursors(new Map());
  }, []);

  const cleanupListeners = useCallback(() => {
    socketCleanupRef.current();
    socketCleanupRef.current = () => {};
  }, []);

  const connectToSocket = useCallback(async () => {
    cleanupListeners();
    if (!token || !roomCode) return;
    setReconnecting(true);
    setSocketError('');

    const unsubConnect = socketService.on('connect', () => {
      if (isMountedRef.current) {
        setConnected(true);
        setReconnecting(false);
      }
    });
    const unsubDisconnect = socketService.on('disconnect', () => {
      if (isMountedRef.current) {
        setConnected(false);
        setReconnecting(true);
        clearRemoteCursors();
      }
    });
    const unsubPresence = socketService.on('presence-update', ({ users } = {}) => {
      if (isMountedRef.current) setOnlineUsers(users || []);
    });
    const unsubUserLeft = socketService.on('user-left', ({ userId } = {}) => {
      if (!userId) return;
      setRemoteCursors((current) => {
        const next = new Map(current);
        next.delete(String(userId));
        return next;
      });
    });
    const unsubCursor = socketService.on('cursor-update', (cursor = {}) => {
      if (!cursor.userId) return;
      const userId = String(cursor.userId);
      setRemoteCursors((current) => new Map(current).set(userId, cursor));
      const previousTimer = cursorExpiryTimersRef.current.get(userId);
      if (previousTimer) clearTimeout(previousTimer);
      cursorExpiryTimersRef.current.set(userId, window.setTimeout(() => {
        setRemoteCursors((current) => {
          const next = new Map(current);
          next.delete(userId);
          return next;
        });
        cursorExpiryTimersRef.current.delete(userId);
      }, 15000));
    });
    const unsubRole = socketService.on('member-role-updated', ({ role, userId } = {}) => onRoleUpdated?.(role, userId));
    const unsubCode = socketService.on('code-change', (data) => onRemoteCode?.(data));
    const unsubChat = socketService.on('chat-message', (data) => onChatIncoming?.(data));
    const unsubExecution = socketService.on('code-execution-result', (data) => onExecutionResult?.(data));
    const unsubDeleted = socketService.on('room-deleted', () => onRoomDeleted?.());

    socketCleanupRef.current = () => {
      [unsubConnect, unsubDisconnect, unsubPresence, unsubUserLeft, unsubCursor, unsubRole, unsubCode, unsubChat, unsubExecution, unsubDeleted].forEach((fn) => fn());
      clearRemoteCursors();
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
    } catch {
      if (isMountedRef.current) {
        setSocketError('Could not connect to collaboration server. Retrying…');
        setReconnecting(true);
      }
    }
  }, [cleanupListeners, clearRemoteCursors, token, roomCode, isMountedRef, onRemoteCode, onRoomDeleted, onChatIncoming, onExecutionResult, onRoleUpdated, fetchMessages]);

  useEffect(() => {
    if (room && token) void connectToSocket();
    return cleanupListeners;
  }, [room, token, connectToSocket, cleanupListeners]);

  return {
    connected,
    reconnecting,
    socketError,
    onlineUsers,
    remoteCursors,
    connectToSocket,
    cleanupListeners,
  };
};
