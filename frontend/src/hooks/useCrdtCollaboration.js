import { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socketService';
import { TextCrdt, makeClientId } from '../utils/textCrdt';

const ACK_TIMEOUT_MS = 5000;

export const useCrdtCollaboration = ({
  room,
  roomCode,
  enabled = true,
  onChange,
  fallbackText = '',
}) => {
  const clientIdRef = useRef(makeClientId());
  const crdtRef = useRef(new TextCrdt(clientIdRef.current));
  const applyingRemoteRef = useRef(false);
  const initializedRef = useRef(false);
  const [crdtReady, setCrdtReady] = useState(false);
  const [crdtError, setCrdtError] = useState('');

  const emitText = useCallback((text) => {
    onChange?.(text);
  }, [onChange]);

  const requestSync = useCallback(() => {
    const socket = socketService.socket;
    if (!socket?.connected || !socketService.getCurrentRoom()) return;

    socket.timeout(ACK_TIMEOUT_MS).emit('crdt-sync-request', {}, (ackError, response) => {
      if (ackError || response?.error) {
        setCrdtError(response?.error || 'Collaborative synchronization timed out.');
      }
    });
  }, []);

  useEffect(() => {
    if (!enabled || !room) return undefined;

    const attachSocketListeners = () => {
      const socket = socketService.socket;
      if (!socket) return () => {};

      const handleSync = ({ state } = {}) => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        crdtRef.current.resetFromState(state);
        applyingRemoteRef.current = true;
        emitText(crdtRef.current.getText());
        applyingRemoteRef.current = false;
        setCrdtReady(true);
        setCrdtError('');
      };

      const handleOperation = (operation) => {
        const changed = crdtRef.current.applyReplaceOperation(operation);
        if (!changed) return;

        applyingRemoteRef.current = true;
        emitText(crdtRef.current.getText());
        applyingRemoteRef.current = false;
      };

      const handleError = ({ message } = {}) => {
        setCrdtError(message || 'Collaborative synchronization failed.');
      };

      socket.on('crdt-sync', handleSync);
      socket.on('crdt-operation', handleOperation);
      socket.on('crdt-error', handleError);
      requestSync();

      return () => {
        socket.off('crdt-sync', handleSync);
        socket.off('crdt-operation', handleOperation);
        socket.off('crdt-error', handleError);
      };
    };

    let cleanupSocket = () => {};
    const handleConnect = () => {
      cleanupSocket();
      cleanupSocket = attachSocketListeners();
    };

    const unsubscribeConnect = socketService.on('connect', handleConnect);

    if (socketService.isConnected()) {
      cleanupSocket = attachSocketListeners();
    }

    return () => {
      unsubscribeConnect();
      cleanupSocket();
      initializedRef.current = false;
      setCrdtReady(false);
    };
  }, [enabled, room, roomCode, emitText, requestSync]);

  const handleLocalChange = useCallback(async (nextText) => {
    if (!enabled || applyingRemoteRef.current || !crdtReady) return;

    const operation = crdtRef.current.replaceText(nextText);
    if (!operation) return;

    const socket = socketService.socket;
    if (!socket?.connected || !socketService.getCurrentRoom()) {
      setCrdtError('Not connected to the collaboration server.');
      return;
    }

    try {
      await new Promise((resolve, reject) => {
        socket.timeout(ACK_TIMEOUT_MS).emit('crdt-operation', operation, (ackError, response) => {
          if (ackError) return reject(new Error('No acknowledgement from collaboration server.'));
          if (response?.error) return reject(new Error(response.error));
          resolve(response);
        });
      });
      setCrdtError('');
    } catch (error) {
      setCrdtError(error.message || 'Failed to synchronize collaborative edit.');
    }
  }, [enabled, crdtReady]);

  useEffect(() => {
    if (!room || initializedRef.current || crdtRef.current.getText()) return;
    if (fallbackText) emitText(fallbackText);
  }, [room, fallbackText, emitText]);

  return {
    crdtReady,
    crdtError,
    handleLocalChange,
    clientId: clientIdRef.current,
  };
};
