import { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socketService';
import { TextCrdt, makeClientId } from '../utils/textCrdt';

const ACK_TIMEOUT_MS = 5000;
const JOIN_SYNC_WAIT_MS = 5000;
const JOIN_SYNC_RETRY_MS = 50;

export const useCrdtCollaboration = ({
  room,
  roomCode,
  fileId = null,
  enabled = true,
  onChange,
  fallbackText = '',
  onDocumentRestored,
}) => {
  const clientIdRef = useRef(makeClientId());
  const crdtRef = useRef(new TextCrdt(clientIdRef.current));
  const applyingRemoteRef = useRef(false);
  const initializedRef = useRef(false);
  const [crdtReady, setCrdtReady] = useState(false);
  const [crdtError, setCrdtError] = useState('');

  const emitText = useCallback((text) => onChange?.(text), [onChange]);
  const requestSync = useCallback(() => {
    const socket = socketService.socket;
    if (!socket?.connected || !socketService.getCurrentRoom()) return false;
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit('crdt-sync-request', { fileId: fileId || null }, (ackError, response) => {
        if (ackError || response?.error) {
          setCrdtError(response?.error || 'Collaborative synchronization timed out.');
        }
      });
    return true;
  }, [fileId]);

  useEffect(() => {
    if (!enabled || !room) return undefined;
    setCrdtReady(false);
    setCrdtError('');
    initializedRef.current = false;
    crdtRef.current.resetFromState('');

    const attachSocketListeners = () => {
      const socket = socketService.socket;
      if (!socket) return () => {};
      const handleSync = ({ state, fileId: syncedFileId } = {}) => {
        if ((syncedFileId || null) !== (fileId || null) || initializedRef.current) return;
        initializedRef.current = true;
        crdtRef.current.resetFromState(state);
        applyingRemoteRef.current = true;
        emitText(crdtRef.current.getText());
        applyingRemoteRef.current = false;
        setCrdtReady(true);
        setCrdtError('');
      };
      const handleOperation = (operation) => {
        if ((operation?.fileId || null) !== (fileId || null)) return;
        const changed = crdtRef.current.applyReplaceOperation(operation);
        if (!changed) return;
        applyingRemoteRef.current = true;
        emitText(crdtRef.current.getText());
        applyingRemoteRef.current = false;
      };
      const handleRestore = ({
        state,
        content,
        language,
        revisionId,
        fileId: restoredFileId,
      } = {}) => {
        if ((restoredFileId || null) !== (fileId || null)) return;
        if (!state) {
          setCrdtError('The restored document did not contain a valid collaborative state.');
          return;
        }
        crdtRef.current.resetFromState(state);
        initializedRef.current = true;
        applyingRemoteRef.current = true;
        emitText(typeof content === 'string' ? content : crdtRef.current.getText());
        applyingRemoteRef.current = false;
        setCrdtReady(true);
        setCrdtError('');
        onDocumentRestored?.({ content, language, revisionId, fileId: restoredFileId || null });
      };
      const handleError = ({ message } = {}) =>
        setCrdtError(message || 'Collaborative synchronization failed.');
      socket.on('crdt-sync', handleSync);
      socket.on('crdt-operation', handleOperation);
      socket.on('document-restored', handleRestore);
      socket.on('crdt-error', handleError);
      const start = Date.now();
      let retryTimer = null;
      const tryRequest = () => {
        if (initializedRef.current) return;
        if (requestSync()) return;
        if (Date.now() - start >= JOIN_SYNC_WAIT_MS) {
          setCrdtError('Could not initialize collaborative editing for this file.');
          return;
        }
        retryTimer = window.setTimeout(tryRequest, JOIN_SYNC_RETRY_MS);
      };
      tryRequest();
      return () => {
        if (retryTimer) window.clearTimeout(retryTimer);
        socket.off('crdt-sync', handleSync);
        socket.off('crdt-operation', handleOperation);
        socket.off('document-restored', handleRestore);
        socket.off('crdt-error', handleError);
      };
    };

    let cleanupSocket = () => {};
    const handleConnect = () => {
      cleanupSocket();
      cleanupSocket = attachSocketListeners();
    };
    const unsubscribeConnect = socketService.on('connect', handleConnect);
    if (socketService.isConnected()) cleanupSocket = attachSocketListeners();
    return () => {
      unsubscribeConnect();
      cleanupSocket();
      initializedRef.current = false;
      setCrdtReady(false);
    };
  }, [enabled, room, roomCode, fileId, emitText, requestSync, onDocumentRestored]);

  const handleLocalChange = useCallback(
    async (nextText) => {
      if (!enabled || applyingRemoteRef.current || !crdtReady) return;
      const operation = crdtRef.current.replaceText(nextText);
      if (!operation) return;
      operation.fileId = fileId || null;
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
    },
    [enabled, crdtReady, fileId]
  );

  useEffect(() => {
    if (!room || initializedRef.current || crdtRef.current.getText()) return;
    if (fallbackText) emitText(fallbackText);
  }, [room, fallbackText, emitText]);

  return { crdtReady, crdtError, handleLocalChange, clientId: clientIdRef.current };
};
