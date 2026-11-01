import { act, renderHook } from '@testing-library/react';
import { useCrdtCollaboration } from './useCrdtCollaboration';
import { TextCrdt } from '../utils/textCrdt';
import socketService from '../services/socketService';

vi.mock('../services/socketService', () => ({
  default: { on: vi.fn(), isConnected: vi.fn(), getCurrentRoom: vi.fn(), socket: null },
}));

describe('CRDT recovery after reconnect', () => {
  it('disables editing while disconnected and applies a fresh server snapshot', async () => {
    const lifecycle = new Map();
    const events = new Map();
    const onChange = vi.fn();
    socketService.on.mockImplementation((event, callback) => {
      lifecycle.set(event, callback);
      return () => lifecycle.delete(event);
    });
    socketService.isConnected.mockReturnValue(true);
    socketService.getCurrentRoom.mockReturnValue('ABC123');
    const emit = vi.fn();
    socketService.socket = {
      connected: true,
      on: vi.fn((event, callback) => events.set(event, callback)),
      off: vi.fn((event) => events.delete(event)),
      timeout: vi.fn(() => ({ emit })),
    };
    const stateFor = (text) => {
      const document = new TextCrdt('server');
      document.replaceText(text);
      return document.exportState();
    };
    const { result } = renderHook(() =>
      useCrdtCollaboration({
        room: true,
        roomCode: 'ABC123',
        fileId: 'file-1',
        onChange,
      })
    );

    act(() => events.get('crdt-sync')({ state: stateFor('before'), fileId: 'file-1' }));
    expect(result.current.crdtReady).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith('before');

    act(() => {
      socketService.socket.connected = false;
      lifecycle.get('disconnect')();
    });
    expect(result.current.crdtReady).toBe(false);

    act(() => {
      socketService.socket.connected = true;
      lifecycle.get('connect')();
      events.get('crdt-sync')({ state: stateFor('after'), fileId: 'file-1' });
    });
    expect(emit).toHaveBeenCalledTimes(2);
    expect(result.current.crdtReady).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith('after');
  });
});
