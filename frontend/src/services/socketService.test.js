import { io } from 'socket.io-client';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

import socketService from './socketService';

const createFakeSocket = () => {
  const handlers = {};
  return {
    connected: false,
    id: 'sock-1',
    on: vi.fn((event, cb) => {
      handlers[event] = cb;
    }),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(() => {
      fakeSocket.connected = false;
    }),
    emit: vi.fn(),
    timeout: vi.fn(() => ({
      emit: (event, payload, cb) => {
        fakeSocket.ackCallback = { event, payload, cb };
      },
    })),
  };
};

let fakeSocket;

beforeEach(() => {
  vi.clearAllMocks();
  fakeSocket = createFakeSocket();
  io.mockReturnValue(fakeSocket);
  socketService.disconnect();
});

afterEach(() => {
  socketService.disconnect();
});

describe('SocketService', () => {
  it('is not connected before connect', () => {
    expect(socketService.isConnected()).toBe(false);
  });

  it('creates a socket with the token in auth and connects', () => {
    socketService.connect('tok-1');

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: { token: 'tok-1' } })
    );

    // Simulate the server accepting the connection.
    fakeSocket.connected = true;
    const connectHandler = fakeSocket.on.mock.calls.find(([e]) => e === 'connect')[1];
    connectHandler();

    expect(socketService.isConnected()).toBe(true);
  });

  it('rejects join-room when there is no socket', async () => {
    await expect(socketService.joinRoom('ABC123')).rejects.toThrow('Not connected to server');
  });

  it('resolves join-room with the ack response and records the room', async () => {
    socketService.connect('tok-1');
    fakeSocket.connected = true;
    const ackResponse = { success: true, room: { roomCode: 'ABC123' } };

    const promise = socketService.joinRoom('abc123');
    fakeSocket.ackCallback.cb(null, ackResponse);
    const response = await promise;

    expect(fakeSocket.ackCallback.payload).toEqual({ roomCode: 'abc123' });
    expect(response).toEqual(ackResponse);
    expect(socketService.getCurrentRoom()).toBe('ABC123');
  });

  it('rejects join-room when the server returns an error ack', async () => {
    socketService.connect('tok-1');
    fakeSocket.connected = true;

    const promise = socketService.joinRoom('ABC123');
    fakeSocket.ackCallback.cb(null, { error: 'Room not found.' });

    await expect(promise).rejects.toThrow('Room not found.');
  });

  it('auto-joins room before sending code changes when not yet joined', async () => {
    socketService.connect('tok-1');
    fakeSocket.connected = true;

    const promise = socketService.sendCodeChange('console.log("shared")', 'javascript', 'abc123');

    expect(fakeSocket.ackCallback.event).toBe('join-room');
    fakeSocket.ackCallback.cb(null, { success: true, room: { roomCode: 'ABC123' } });

    let emittedCodeChange = false;
    for (let i = 0; i < 20; i++) {
      if (fakeSocket.timeout.mock.calls.length > 1) {
        emittedCodeChange = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(emittedCodeChange).toBe(true);
    expect(fakeSocket.ackCallback.event).toBe('code-change');
    expect(fakeSocket.ackCallback.payload).toEqual({
      content: 'console.log("shared")',
      language: 'javascript',
    });

    fakeSocket.ackCallback.cb(null, { success: true });
    await expect(promise).resolves.toEqual({ success: true });
  });

  it('subscribes and unsubscribes listeners', () => {
    const listener = vi.fn();
    const off = socketService.on('presence-update', listener);

    socketService.emitEvent('presence-update', { users: [] });
    expect(listener).toHaveBeenCalledWith({ users: [] });

    off();
    socketService.emitEvent('presence-update', { users: [] });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
