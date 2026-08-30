import { useEffect } from 'react';
import { buildCursorDecoration } from '../utils/cursor';

/**
 * Mirrors remote collaborators' latest cursor/selection state into Monaco.
 * Decorations are fully replaced on each state update so stale cursors cannot
 * survive disconnects or room switches.
 */
export const useRemoteCursors = (editor, remoteCursors) => {
  useEffect(() => {
    if (!editor) return undefined;

    const model = editor.getModel();
    if (!model) return undefined;

    const decorations = Object.values(remoteCursors)
      .map((cursor) =>
        buildCursorDecoration({
          cursor,
          editorLineCount: model.getLineCount(),
        })
      )
      .filter(Boolean);

    const collection = editor.createDecorationsCollection(decorations);
    return () => collection.clear();
  }, [editor, remoteCursors]);
};
