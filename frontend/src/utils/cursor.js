/**
 * Deterministic cursor styling and Monaco range validation helpers.
 * Keeping these pure makes cursor rendering easy to unit-test.
 */

const CURSOR_PALETTE = [
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#c084fc',
  '#84cc16',
  '#f97316',
  '#2dd4bf',
  '#e879f9',
];

export const cursorColorForUser = (userId = '') => {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) | 0;
  }
  return CURSOR_PALETTE[Math.abs(hash) % CURSOR_PALETTE.length];
};

export const normalizeCursorPosition = (position) => {
  if (!position || !Number.isInteger(position.line) || !Number.isInteger(position.column)) {
    return null;
  }
  if (position.line < 1 || position.column < 1) return null;
  return { line: position.line, column: position.column };
};

export const normalizeCursorSelection = (selection) => {
  if (!selection) return null;
  const start = normalizeCursorPosition({ line: selection.startLineNumber, column: selection.startColumn });
  const end = normalizeCursorPosition({ line: selection.endLineNumber, column: selection.endColumn });
  if (!start || !end) return null;
  return {
    startLineNumber: start.line,
    startColumn: start.column,
    endLineNumber: end.line,
    endColumn: end.column,
  };
};

export const buildCursorDecoration = ({ cursor, editorLineCount }) => {
  if (!cursor) return null;
  const position = normalizeCursorPosition(cursor.position);
  if (!position || position.line > editorLineCount) return null;

  const selection = normalizeCursorSelection(cursor.selection);
  const range = selection || {
    startLineNumber: position.line,
    startColumn: position.column,
    endLineNumber: position.line,
    endColumn: position.column,
  };

  return {
    range,
    options: {
      isWholeLine: Boolean(selection),
      className: `remote-cursor remote-cursor-${cursor.colorKey}`,
      beforeContentClassName: `remote-cursor-caret remote-cursor-${cursor.colorKey}`,
      hoverMessage: {
        value: `**${cursor.name || 'Collaborator'}**`,
      },
      overviewRuler: {
        color: cursor.color,
        position: 2,
      },
    },
  };
};

export const cursorPaletteKeys = CURSOR_PALETTE.map((_, index) => index);
export const cursorColorByKey = (key) => CURSOR_PALETTE[key] || CURSOR_PALETTE[0];
