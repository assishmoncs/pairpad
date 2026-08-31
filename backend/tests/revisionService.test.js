jest.mock('../src/models/Revision', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'rev1' }),
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([{ _id: 'rev1' }]),
  }),
  findOne: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue({ _id: 'rev1' }),
  }),
}));

const {
  MIN_AUTOMATIC_INTERVAL_MS,
  shouldCreateAutomaticRevision,
  clearAutomaticCheckpoint,
  createRevision,
  listRevisions,
  findRevision,
} = require('../src/services/revisionService');

describe('revision service checkpoint policy', () => {
  const roomKey = 'TESTROOM';

  afterEach(() => {
    clearAutomaticCheckpoint(roomKey);
  });

  test('creates the first automatic checkpoint', () => {
    expect(shouldCreateAutomaticRevision(roomKey)).toBe(true);
  });

  test('throttles repeated automatic checkpoints', () => {
    expect(shouldCreateAutomaticRevision(roomKey)).toBe(true);
    expect(shouldCreateAutomaticRevision(roomKey)).toBe(false);
  });

  test('allows another checkpoint after the interval', () => {
    expect(MIN_AUTOMATIC_INTERVAL_MS).toBe(10000);
    expect(shouldCreateAutomaticRevision(roomKey)).toBe(true);

    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(Date.now() + MIN_AUTOMATIC_INTERVAL_MS + 1);

    expect(shouldCreateAutomaticRevision(roomKey)).toBe(true);
    Date.now.mockRestore();
  });

  test('covers createRevision, listRevisions, and findRevision', async () => {
    await createRevision({ room: 'r1', author: 'u1', content: 'test', language: 'js', message: 'test' });
    const list1 = await listRevisions('r1', 10);
    expect(list1).toBeDefined();

    const list2 = await listRevisions('r1', 10, '2026-01-01T00:00:00.000Z');
    expect(list2).toBeDefined();

    await expect(listRevisions('r1', 10, 'invalid-date')).rejects.toThrow('Invalid revision cursor.');

    const rev = await findRevision('rev1', 'r1');
    expect(rev).toBeDefined();
  });
});
