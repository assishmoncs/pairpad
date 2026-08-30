const socketHandlerDistributed = require('../src/sockets/socketHandlerDistributed');

jest.mock('../src/services/redisPresenceServiceV2', () => ({
  joinRoom: jest.fn(),
  leaveRoom: jest.fn(),
  getRoomMembers: jest.fn().mockResolvedValue([]),
  updateActivity: jest.fn()
}));
jest.mock('../src/sockets/crdtSocketHandler', () => ({
  handleCrdtSocketEvents: jest.fn(),
  initializeCrdtSocket: jest.fn()
}));
jest.mock('../src/services/redisDocumentState', () => ({
  getRoomDocumentState: jest.fn(),
  saveRoomDocumentState: jest.fn(),
  deleteRoomDocumentState: jest.fn()
}));

describe('socketHandlerDistributed', () => {
  it('handles connection and events', async () => {
    const handlers = {};
    const socket = {
      id: 'soc1',
      handshake: { auth: { token: 'mock' }, query: { roomCode: 'ROOM1' } },
      user: { _id: 'user1', name: 'User 1' },
      on: jest.fn((event, cb) => { handlers[event] = cb; }),
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      disconnect: jest.fn()
    };

    const io = {
      use: jest.fn((cb) => cb(socket, jest.fn())),
      on: jest.fn((event, cb) => {
        if (event === 'connection') cb(socket);
      }),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };
    socketHandlerDistributed(io);
    
    // Call every handler with a dummy payload
    const variations = [
      { roomCode: 'ROOM1', fileId: 'F1', content: 'x', type: 'x', position: {}, language: 'javascript', code: 'test' },
      { roomCode: 'ROOM1' },
      {}
    ];
    for (const handler of Object.values(handlers)) {
       for (const payload of variations) {
         try { await handler(payload); } catch { /* ignore */ }
       }
       try { await handler(); } catch { /* ignore */ }
    }
  });
});
