import { useEffect } from 'react';

/**
 * Global keyboard shortcuts for the collaboration workspace.
 * Shortcuts are intentionally limited to actions that are safe from any focus
 * except the Monaco editor itself.
 */
export function useRoomShortcuts({ onRun, onCopyRoomCode, onToggleFocusMode, enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        onRun?.();
      } else if (event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        onCopyRoomCode?.();
      } else if (event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        onToggleFocusMode?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onRun, onCopyRoomCode, onToggleFocusMode]);
}
