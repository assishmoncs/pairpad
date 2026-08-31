import { describe, expect, test } from 'vitest';
import { TextCrdt } from '../utils/textCrdt';

describe('TextCrdt', () => {
  test('replaces text locally and reproduces the same document', () => {
    const local = new TextCrdt('client-a');
    local.resetFromState({ version: 1, nodes: [] });

    const first = local.replaceText('hello');
    expect(first.type).toBe('replace');
    expect(local.getText()).toBe('hello');

    const remote = new TextCrdt('client-b');
    remote.resetFromState(local.exportState());
    expect(remote.getText()).toBe('hello');

    const second = local.replaceText('hello world');
    remote.applyReplaceOperation(second);
    expect(remote.getText()).toBe('hello world');
  });

  test('concurrent edits converge to identical text', () => {
    const a = new TextCrdt('client-a');
    const b = new TextCrdt('client-b');

    a.replaceText('A');
    b.resetFromState(a.exportState());

    const opA = a.replaceText('AB');
    const opB = b.replaceText('AC');

    a.applyReplaceOperation(opB);
    b.applyReplaceOperation(opA);

    expect(a.getText()).toBe(b.getText());
    expect(a.getText()).toContain('A');
    expect(a.getText()).toContain('B');
    expect(a.getText()).toContain('C');
  });

  test('duplicate operations are idempotent', () => {
    const a = new TextCrdt('client-a');
    const op = a.replaceText('PairPad');
    const before = a.getText();

    expect(a.applyReplaceOperation(op)).toBe(false);
    expect(a.getText()).toBe(before);
  });
});
