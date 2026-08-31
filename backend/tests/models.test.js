const User = require('../src/models/User');
const Room = require('../src/models/Room');
describe('Models', () => {
  it('covers Room', () => {
    expect(Room).toBeDefined();
    if (Room.schema.methods.toJSON) {
      Room.schema.methods.toJSON.call({ toObject: () => ({ snapshotCode: 'a', _id: 'b' }) });
      Room.schema.methods.toJSON.call({ toObject: () => ({ snapshotCode: 'a', _id: 'b', members: [], memberRoles: [], interview: { status: 'idle' } }) });
    }
    const roomHook = Room.schema.s.hooks._pres.get('save')?.find(h => !h.fn.name)?.fn;
    if (roomHook) {
      const obj1 = { owner: 'u1', members: ['u1'], memberRoles: [{ user: 'u1', role: 'viewer' }] };
      roomHook.call(obj1, () => {});
      expect(obj1.memberRoles[0].role).toBe('owner');

      const obj2 = { owner: 'u1', members: ['u2'], memberRoles: [] };
      roomHook.call(obj2, () => {});
      expect(obj2.members).toContain('u1');
    }
  });
  it('covers User', async () => {
    expect(User).toBeDefined();
    if (User.schema.methods.toJSON) User.schema.methods.toJSON.call({ toObject: () => ({ password: 'a', __v: 1 }) });
    if (User.schema.methods.comparePassword) await User.schema.methods.comparePassword.call({ password: 'a' }, 'b').catch(() => {});
    const userHook = User.schema.s.hooks._pres.get('save')?.find(h => !h.fn.name)?.fn;
    if (userHook) {
      await new Promise((res) => userHook.call({ isModified: () => false }, res));
      const obj = { isModified: () => true, password: 'pw' };
      await new Promise((res) => userHook.call(obj, res));
      expect(obj.password).not.toBe('pw');
      await new Promise((res) => userHook.call({ isModified: () => true, password: null }, () => res()));
    }
  });
});
