import { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socketService';

/**
 * Owns the Socket.IO collaboration lifecycle for a room: connection,
 * auto-reconnect, room join/rejoin, presence, code sync, chat, and execution
 * broadcast forwarding.
 *
 * @param {object} options
 * @param {object|null} options.room         Loaded room (enables socket setup)
 * @param {string|null} options.token        JWT
 * @param {string} options.roomCode          URL room code
 * @param {React.MutableRefObject} options.isMountedRef
 * @param {Function} options.onRemoteCode    ({ content, language }) => void
 * @param {Function} options.onRoomDeleted   () => void
 * @param {Function} options.onChatIncoming  (message) => void
 * @param {Function} options.onExecutionResult ({ result }) => void
 * @param {Function} options.fetchMessages   () => Promise<void>
 */
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
  const [socketError, setSocketError] = useState('');

  // Holds the unsubscribe function for all listeners registered for this room.
  const socketCleanupRef = useRef(null);
  // Set to true when an editor change is remote so the local handler skips a re-broadcast.
  const isRemoteChangeRef = useRef(false);

  const cleanupListeners = useCallback(() => {
    if (socketCleanupRef.current) {
      socketCleanupRef.current();
      socketCleanupRef.current = null;
    }
  }, []);

  /**
   * Set up all socket listeners and connect (or re-use an existing connection).
   * CRITICAL ORDER: listeners MUST be registered before connect() so the
   * 'connect' event is never missed on fast / already-connected sockets.
   */
  const connectToSocket = useCallback(async () => {
    cleanupListeners();
    setSocketError('');
    setReconnecting(false);

    // 1. Register all listeners BEFORE connect()
    const unsubConnect = socketService.on('connect', async () => {
      if (!isMountedRef.current) return;
      setConnected(true);
      setReconnecting(false);
      setSocketError('');

      // Re-join after a reconnect so presence is restored.
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

    const unsubDisconnect = socketService.on('disconnect', ({ reason } = {}) => {
      if (!isMountedRef.current) return;
      setConnected(false);
      const intentional = reason === 'io client disconnect' || reason === 'io server disconnect';
      setReconnecting(!intentional);
    });

    const unsubError = socketService.on('connect_error', () => {
      // Transient error; Socket.IO keeps retrying. No UI override needed here.
    });

    const unsubPresence = socketService.on('presence-update', ({ users }) => {
      if (!isMountedRef.current) return;
      setOnlineUsers(users || []);
    });

    const unsubCodeChange = socketService.on(
      'code-change',
      ({ content, language: nextLanguage }) => {
        if (!isMountedRef.current) return;
        isRemoteChangeRef.current = true;
        onRemoteCode({ content, language: nextLanguage });
        setTimeout(() => {
          isRemoteChangeRef.current = false;
        }, 0);
      }
    );

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
      unsubCodeChange();
      unsubChatMessage();
      unsubExecutionResult();
      unsubRoomDeleted();
    };

    // 2. Connect (or reuse) AFTER listeners are in place
    try {
      socketService.connect(token);

      await socketService.waitForConnection();

      if (!isMountedRef.current) return;
      setConnected(true);

      // 3. Join the room channel
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

      // 4. Load chat history
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
    token,
    roomCode,
    isMountedRef,
    onRemoteCode,
    onChatIncoming,
    onExecutionResult,
    onRoomDeleted,
    fetchMessages,
  ]);

  // Connect once the room is loaded and we have a token. Clean up listeners
  // (but keep the socket alive for reuse) on dependency change.
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
    socketError,
    setSocketError,
    isRemoteChangeRef,
    connectToSocket,
    cleanupListeners,
  };
};
