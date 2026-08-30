const { parseLimit, parseBeforeDate, DEFAULT_LIMIT, MAX_LIMIT } = require('../src/utils/pagination');

describe('pagination helpers', () => {
  test('uses bounded defaults', () => {
    expect(parseLimit()).toBe(DEFAULT_LIMIT);
    expect(parseLimit('0')).toBe(1);
    expect(parseLimit('9999')).toBe(MAX_LIMIT);
    expect(parseLimit('not-a-number')).toBe(DEFAULT_LIMIT);
  });

  test('parses valid dates and rejects invalid dates', () => {
    expect(parseBeforeDate('2026-01-01T00:00:00.000Z')).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(parseBeforeDate('invalid-date')).toBeNull();
    expect(parseBeforeDate()).toBeNull();
  });
});
