import { describe, expect, it } from 'vitest';
import {
  buildCursorDecoration,
  cursorColorForUser,
  cursorColorKeyForUser,
  normalizeCursorPosition,
  normalizeCursorSelection,
} from '../utils/cursor';

describe('cursor helpers', () => {
  it('assigns a deterministic color to a user', () => {
    expect(cursorColorForUser('user-123')).toBe(cursorColorForUser('user-123'));
    expect(cursorColorKeyForUser('user-123')).toBe(cursorColorKeyForUser('user-123'));
  });

  it('normalizes valid and rejects invalid positions', () => {
    expect(normalizeCursorPosition({ line: 2, column: 5 })).toEqual({ line: 2, column: 5 });
    expect(normalizeCursorPosition({ line: 0, column: 5 })).toBeNull();
    expect(normalizeCursorPosition({ line: 2, column: 0 })).toBeNull();
  });

  it('normalizes selections', () => {
    expect(normalizeCursorSelection({
      startLineNumber: 1,
      startColumn: 2,
      endLineNumber: 3,
      endColumn: 4,
    })).toEqual({ startLineNumber: 1, startColumn: 2, endLineNumber: 3, endColumn: 4 });
    expect(normalizeCursorSelection({ startLineNumber: 0 })).toBeNull();
  });

  it('builds a Monaco decoration for a valid cursor', () => {
    const decoration = buildCursorDecoration({
      cursor: {
        userId: 'u1',
        name: 'Alice',
        colorKey: 2,
        color: '#fbbf24',
        position: { line: 4, column: 3 },
        selection: null,
      },
      editorLineCount: 10,
    });
    expect(decoration.range.startLineNumber).toBe(4);
    expect(decoration.range.startColumn).toBe(3);
    expect(decoration.options.hoverMessage.value).toContain('Alice');
  });

  it('drops a cursor beyond the current document', () => {
    expect(buildCursorDecoration({
      cursor: { position: { line: 20, column: 1 } },
      editorLineCount: 10,
    })).toBeNull();
  });
});
