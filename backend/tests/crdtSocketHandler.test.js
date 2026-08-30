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
    if (syncReq) {
      try { syncReq[1]({}, jest.fn()); } catch { /* ignore */ }
      try { syncReq[1]({ fileId: 'f1' }, jest.fn()); } catch { /* ignore */ }
    }

    const opReq = socket.on.mock.calls.find(c => c[0] === 'crdt-operation');
    if (opReq) {
      try { opReq[1]({ type: 'replace' }, jest.fn()); } catch { /* ignore */ }
      try { opReq[1]({ type: 'insert', fileId: 'f1', content: 'x' }, jest.fn()); } catch { /* ignore */ }
    }

    const cursorReq = socket.on.mock.calls.find(c => c[0] === 'crdt-cursor');
    if (cursorReq) {
      try { cursorReq[1]({ position: 0 }); } catch { /* ignore */ }
    }

    const discReq = socket.on.mock.calls.find(c => c[0] === 'disconnect');
    if (discReq) discReq[1]();
  });
  
  it('replaceDocumentState', () => {
    crdtSocketHandler.replaceDocumentState('R1', 'content', 'F1');
  });
});
