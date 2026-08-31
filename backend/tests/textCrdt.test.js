const {
  createInitialState,
  visibleText,
  applyReplaceOperation,
  createReplaceOperation,
  serializeState,
  deserializeState,
} = require('../src/services/textCrdt');

describe('text CRDT', () => {
  test('bootstraps and serializes a document without losing text', () => {
    const state = createInitialState('hello');
    expect(visibleText(state)).toBe('hello');

    const restored = deserializeState(serializeState(state));
    expect(visibleText(restored)).toBe('hello');
  });

  test('merges concurrent inserts deterministically', () => {
    const left = createInitialState('A');
    const right = createInitialState('A');

    const leftEdit = createReplaceOperation(left, 'AB', 'client-b', 0).operation;
    const rightEdit = createReplaceOperation(right, 'AC', 'client-a', 0).operation;

    applyReplaceOperation(left, leftEdit);
    applyReplaceOperation(right, rightEdit);

    applyReplaceOperation(left, rightEdit);
    applyReplaceOperation(right, leftEdit);

    expect(visibleText(left)).toBe(visibleText(right));
    expect(visibleText(left)).toContain('A');
    expect(visibleText(left)).toContain('B');
    expect(visibleText(left)).toContain('C');
  });

  test('deletes are tombstones and do not invalidate later inserts', () => {
    const state = createInitialState('abc');
    const edit = createReplaceOperation(state, 'ac', 'client-a', 0).operation;
    applyReplaceOperation(state, edit);

    expect(visibleText(state)).toBe('ac');

    const insert = createReplaceOperation(state, 'aXc', 'client-a', 1).operation;
    applyReplaceOperation(state, insert);
    expect(visibleText(state)).toBe('aXc');
  });
});
