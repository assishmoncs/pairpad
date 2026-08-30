const crdtSocketHandler = require('../src/sockets/crdtSocketHandler');

describe('crdtSocketHandler', () => {
  it('exports function', () => {
    expect(typeof crdtSocketHandler.initializeCrdtSocket).toBe('function');
  });

  it('handles events', () => {
    const io = {
      on: jest.fn()
    };
    crdtSocketHandler.initializeCrdtSocket(io);
    expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));

    const connectCb = io.on.mock.calls.find(c => c[0] === 'connection')[1];
    
    const socket = {
      on: jest.fn(),
      currentRoom: 'ROOM1',
      user: { _id: 'u1' },
      emit: jest.fn(),
      to: jest.fn().mockReturnThis()
    };
    connectCb(socket);

    const syncReq = socket.on.mock.calls.find(c => c[0] === 'crdt-sync-request');
    if (syncReq) syncReq[1]({}, jest.fn());

    const opReq = socket.on.mock.calls.find(c => c[0] === 'crdt-operation');
    if (opReq) opReq[1]({ type: 'replace' }, jest.fn());

    const discReq = socket.on.mock.calls.find(c => c[0] === 'disconnect');
    if (discReq) discReq[1]();
  });
  
  it('replaceDocumentState', () => {
    crdtSocketHandler.replaceDocumentState('R1', 'content', 'F1');
  });
});
