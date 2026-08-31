import { beforeEach, describe, expect, it, vi } from 'vitest';

const sockets = [];

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    const handlers = new Map();
    const socket = {
      connected: false,
      id: 'socket-1',
      on: vi.fn((event, callback) => {
        handlers.set(event, callback);
      }),
      emit: vi.fn(),
      timeout: vi.fn(() => ({
        emit: vi.fn((event, payload, callback) => {
          if (event === 'join-room')
            callback?.(null, {
              room: {
                roomCode:
                  typeof payload.roomCode === 'string'
                    ? payload.roomCode.toUpperCase()
                    : payload.roomCode,
              },
              users: [],
              role: 'editor',
            });
        }),
      })),
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(),
      fire(event, payload) {
        handlers.get(event)?.(payload);
      },
    };
    sockets.push(socket);
    return socket;
  }),
}));

describe('socketService lifecycle', () => {
  let socketService;

  beforeEach(async () => {
    vi.resetModules();
    sockets.length = 0;
    socketService = (await import('../services/socketService')).default;
    socketService.disconnect();
  });

  it('propagates connect and disconnect state', async () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    socketService.on('connect', connect);
    socketService.on('disconnect', disconnect);

    const socket = socketService.connect('access-token');
    socket.connected = true;
    socket.fire('connect');

    expect(socketService.isConnected()).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);

    socket.connected = false;
    socket.fire('disconnect', 'transport close');
    expect(socketService.isConnected()).toBe(false);
    expect(disconnect).toHaveBeenCalledWith({ reason: 'transport close' });
  });

  it('joins and remembers a room after a connection', async () => {
    const socket = socketService.connect('access-token');
    socket.connected = true;
    socket.fire('connect');

    const response = await socketService.joinRoom('abc123');

    expect(response.role).toBe('editor');
    expect(socketService.getCurrentRoom()).toBe('ABC123');
  });

  it('clears room state on explicit disconnect', () => {
    const socket = socketService.connect('access-token');
    socket.connected = true;
    socket.fire('connect');
    socketService.currentRoom = 'ABC123';

    socketService.disconnect();

    expect(socketService.isConnected()).toBe(false);
    expect(socketService.getCurrentRoom()).toBeNull();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
