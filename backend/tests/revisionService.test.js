const {
  MIN_AUTOMATIC_INTERVAL_MS,
  shouldCreateAutomaticRevision,
  clearAutomaticCheckpoint,
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
});
