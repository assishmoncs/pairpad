import { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socketService';
import { TextCrdt, makeClientId } from '../utils/textCrdt';

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

  useEffect(() => {
    if (!enabled || !room) return undefined;

    const unsubscribeSync = socketService.on('crdt-sync', ({ state } = {}) => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      const crdt = crdtRef.current;
      crdt.resetFromState(state);
      const syncedText = crdt.getText();

      applyingRemoteRef.current = true;
      emitText(syncedText);
      applyingRemoteRef.current = false;
      setCrdtReady(true);
      setCrdtError('');
    });

    const unsubscribeOperation = socketService.on('crdt-operation', (operation) => {
      const crdt = crdtRef.current;
      const changed = crdt.applyReplaceOperation(operation);
      if (!changed) return;

      applyingRemoteRef.current = true;
      emitText(crdt.getText());
      applyingRemoteRef.current = false;
    });

    const unsubscribeError = socketService.on('crdt-error', ({ message } = {}) => {
      setCrdtError(message || 'Collaborative synchronization failed.');
    });

    let cancelled = false;
    const requestSync = async () => {
      try {
        if (!socketService.isConnected()) {
          await socketService.waitForConnection();
        }
        if (cancelled) return;

        // The regular collaboration hook joins the room first. Once it has
        // done so, request the authoritative CRDT state.
        await socketService.requestCrdtSync();
      } catch (error) {
        if (cancelled) return;
        setCrdtError(error.message || 'Could not initialize collaborative editing.');
        setCrdtReady(false);
      }
    };

    requestSync();

    return () => {
      cancelled = true;
      unsubscribeSync();
      unsubscribeOperation();
      unsubscribeError();
      initializedRef.current = false;
      setCrdtReady(false);
    };
  }, [enabled, room, roomCode, emitText]);

  const handleLocalChange = useCallback(async (nextText) => {
    if (!enabled || applyingRemoteRef.current) return;

    const operation = crdtRef.current.replaceText(nextText);
    if (!operation) return;

    try {
      await socketService.sendCrdtOperation(operation);
      setCrdtError('');
    } catch (error) {
      // The local CRDT remains usable; the next sync can reconcile state.
      setCrdtError(error.message || 'Failed to synchronize collaborative edit.');
    }
  }, [enabled]);

  // Before the first server CRDT state arrives, preserve the REST snapshot so
  // the editor never flashes an empty document.
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
