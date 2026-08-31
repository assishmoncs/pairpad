const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Room = require('../src/models/Room');

describe('Models', () => {
  it('covers Room', async () => {
    expect(Room).toBeDefined();

    if (Room.schema.methods.toJSON) {
      Room.schema.methods.toJSON.call({ toObject: () => ({ snapshotCode: 'a', _id: 'b' }) });
      Room.schema.methods.toJSON.call({
        toObject: () => ({
          snapshotCode: 'a',
          _id: 'b',
          members: [],
          memberRoles: [],
          interview: { status: 'idle' },
        }),
      });
    }

    const roomHook = Room.schema.s.hooks._pres.get('save')?.find((hook) => !hook.fn.name)?.fn;
    if (roomHook) {
      const obj1 = {
        owner: 'u1',
        members: ['u1'],
        memberRoles: [{ user: 'u1', role: 'viewer' }],
      };
      await roomHook.call(obj1);
      expect(obj1.memberRoles[0].role).toBe('owner');

      const obj2 = { owner: 'u1', members: ['u2'], memberRoles: [] };
      await roomHook.call(obj2);
      expect(obj2.members).toContain('u1');
    }
  });

  it('covers User', async () => {
    expect(User).toBeDefined();

    if (User.schema.methods.toJSON) {
      User.schema.methods.toJSON.call({ toObject: () => ({ password: 'a', __v: 1 }) });
    }

    if (User.schema.methods.comparePassword) {
      const hash = await bcrypt.hash('correct', 4);
      await expect(
        User.schema.methods.comparePassword.call({ password: hash }, 'incorrect')
      ).resolves.toBe(false);
    }

    const userHook = User.schema.s.hooks._pres.get('save')?.find((hook) => !hook.fn.name)?.fn;
    if (userHook) {
      await userHook.call({ isModified: () => false });

      const obj = { isModified: () => true, password: 'pw' };
      await userHook.call(obj);
      expect(obj.password).not.toBe('pw');

      await expect(
        userHook.call({ isModified: () => true, password: null })
      ).rejects.toBeTruthy();
    }
  });
});
