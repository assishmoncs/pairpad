import { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socketService';
import { cursorColorForUser, cursorColorKeyForUser } from '../utils/cursor';

export const useCollaboration = ({
  room,
  token,
  roomCode,
  isMountedRef,
  onRemoteCode,
  onRoomDeleted,
  onChatIncoming,
  onExecutionResult,
  fetchMessages,
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
    if (socketCleanupRef.current) {
      socketCleanupRef.current();
      socketCleanupRef.current = null;
    }
    clearRemoteCursors();
  }, [clearRemoteCursors]);

  const connectToSocket = useCallback(async () => {
    cleanupListeners();
    setSocketError('');
    setReconnecting(false);

    const unsubConnect = socketService.on('connect', async () => {
      if (!isMountedRef.current) return;
      setConnected(true);
      setReconnecting(false);
      setSocketError('');
      clearRemoteCursors();

      const currentRoom = socketService.getCurrentRoom();
      if (currentRoom) {
        try {
          const joinResponse = await socketService.joinRoom(currentRoom);
          if (isMountedRef.current && joinResponse.users) setOnlineUsers(joinResponse.users);
        } catch (err) {
          console.error('[Room] Failed to rejoin room on reconnect:', err.message);
          if (isMountedRef.current) setSocketError('Reconnected, but could not rejoin room: ' + err.message);
        }
      }
    });

    const unsubDisconnect = socketService.on('disconnect', ({ reason } = {}) => {
      if (!isMountedRef.current) return;
      setConnected(false);
      clearRemoteCursors();
      const intentional = reason === 'io client disconnect' || reason === 'io server disconnect';
      setReconnecting(!intentional);
    });

    const unsubError = socketService.on('connect_error', () => {});

    const unsubPresence = socketService.on('presence-update', ({ users }) => {
      if (!isMountedRef.current) return;
      const nextUsers = users || [];
      setOnlineUsers(nextUsers);
      const activeIds = new Set(nextUsers.map((user) => String(user.userId)));
      setRemoteCursors((current) => {
        const filtered = {};
        Object.entries(current).forEach(([userId, cursor]) => {
          if (activeIds.has(String(userId))) filtered[userId] = cursor;
        });
        return filtered;
      });
    });

    const unsubUserLeft = socketService.on('user-left', ({ userId } = {}) => {
      if (!isMountedRef.current || !userId) return;
      setRemoteCursors((current) => {
        if (!current[userId]) return current;
        const next = { ...current };
        delete next[userId];
        return next;
      });
    });

    const unsubCursor = socketService.on('cursor-update', (payload = {}) => {
      if (!isMountedRef.current || !payload.userId) return;
      const userId = String(payload.userId);
      setRemoteCursors((current) => ({
        ...current,
        [userId]: {
          userId,
          name: payload.userName || 'Collaborator',
          position: payload.position,
          selection: payload.selection || null,
          color: cursorColorForUser(userId),
          colorKey: cursorColorKeyForUser(userId),
        },
      }));
    });

    const unsubCodeChange = socketService.on('code-change', ({ content, language: nextLanguage }) => {
      if (!isMountedRef.current) return;
      isRemoteChangeRef.current = true;
      lastRemoteCodeRef.current = content;
      onRemoteCode({ content, language: nextLanguage });
      setTimeout(() => {
        isRemoteChangeRef.current = false;
      }, 50);
    });

    const unsubChatMessage = socketService.on('chat-message', onChatIncoming);
    const unsubExecutionResult = socketService.on('code-execution-result', onExecutionResult);
    const unsubRoomDeleted = socketService.on('room-deleted', () => {
      if (!isMountedRef.current) return;
      setSocketError('This room was deleted. Returning to dashboard…');
      onRoomDeleted();
    });

    socketCleanupRef.current = () => {
      unsubConnect();
      unsubDisconnect();
      unsubError();
      unsubPresence();
      unsubUserLeft();
      unsubCursor();
      unsubCodeChange();
      unsubChatMessage();
      unsubExecutionResult();
      unsubRoomDeleted();
    };

    try {
      socketService.connect(token);
      await socketService.waitForConnection();
      if (!isMountedRef.current) return;
      setConnected(true);

      try {
        const joinResponse = await socketService.joinRoom(roomCode);
        if (isMountedRef.current && joinResponse.users) setOnlineUsers(joinResponse.users);
      } catch (joinError) {
        if (isMountedRef.current) setSocketError('Failed to join room: ' + joinError.message);
      }

      await fetchMessages();
    } catch (err) {
      console.error('[Room] Socket connection failed:', err.message);
      if (isMountedRef.current) {
        setSocketError('Could not connect to collaboration server. Retrying…');
        setReconnecting(true);
      }
    }
  }, [
    cleanupListeners,
    clearRemoteCursors,
    token,
    roomCode,
    isMountedRef,
    onRemoteCode,
    onChatIncoming,
    onExecutionResult,
    onRoomDeleted,
    fetchMessages,
  ]);

  useEffect(() => {
    if (!room || !token) return;
    connectToSocket();
    return () => {
      cleanupListeners();
      socketService.leaveRoom();
    };
  }, [room, token, connectToSocket, cleanupListeners]);

  return {
    connected,
    reconnecting,
    onlineUsers,
    remoteCursors,
    socketError,
    setSocketError,
    isRemoteChangeRef,
    lastRemoteCodeRef,
    connectToSocket,
    cleanupListeners,
  };
};
