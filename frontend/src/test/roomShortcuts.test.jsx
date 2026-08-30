import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useRoomShortcuts } from '../hooks/useRoomShortcuts';

describe('useRoomShortcuts', () => {
  it('runs code from Ctrl/Cmd+Enter', () => {
    const onRun = vi.fn();
    renderHook(() => useRoomShortcuts({ onRun, enabled: true }));
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onRun).toHaveBeenCalledOnce();
  });

  it('copies the room code from Ctrl/Cmd+Shift+C', () => {
    const onCopyRoomCode = vi.fn();
    renderHook(() => useRoomShortcuts({ onCopyRoomCode, enabled: true }));
    fireEvent.keyDown(window, { key: 'c', metaKey: true, shiftKey: true });
    expect(onCopyRoomCode).toHaveBeenCalledOnce();
  });

  it('does nothing when disabled', () => {
    const onRun = vi.fn();
    renderHook(() => useRoomShortcuts({ onRun, enabled: false }));
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onRun).not.toHaveBeenCalled();
  });
});
