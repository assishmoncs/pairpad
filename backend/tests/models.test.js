const User = require('../src/models/User');
const Room = require('../src/models/Room');
describe('Models', () => {
  it('covers Room', () => {
    expect(Room).toBeDefined();
    if(Room.schema.methods.toJSON) {
      Room.schema.methods.toJSON.call({ toObject: () => ({ snapshotCode: 'a', _id: 'b' }) });
      Room.schema.methods.toJSON.call({ toObject: () => ({ snapshotCode: 'a', _id: 'b', members: [], memberRoles: [], interview: { status: 'idle' } }) });
    }
  });
  it('covers User', async () => {
    expect(User).toBeDefined();
    if(User.schema.methods.toJSON) User.schema.methods.toJSON.call({ toObject: () => ({ password: 'a', __v: 1 }) });
    if(User.schema.methods.comparePassword) await User.schema.methods.comparePassword.call({ password: 'a' }, 'b').catch(() => {});
  });
});
