/**
 * PairPad sequence CRDT.
 *
 * This is a small, deterministic character-level sequence CRDT designed for
 * collaborative source files. Each inserted character has a globally unique
 * logical id and points at the character it was inserted after. Concurrent
 * inserts at the same position are ordered by id, while deletes are tombstones.
 *
 * The server stores the CRDT state and rebroadcasts operations; clients can
 * independently merge operations without last-write-wins document replacement.
 */

const MAX_NODES = 750000;

const cloneNode = (node) => ({
  id: node.id,
  char: node.char,
  after: node.after ?? null,
  deleted: Boolean(node.deleted),
});

const normalizeState = (state) => {
  const nodes = new Map();
  if (!state || !Array.isArray(state.nodes)) {
    return nodes;
  }

  for (const raw of state.nodes) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.char !== 'string') continue;
    if (raw.char.length !== 1 || raw.id.length > 160) continue;
    if (nodes.size >= MAX_NODES) break;
    nodes.set(raw.id, cloneNode(raw));
  }
  return nodes;
};

const exportState = (nodes) => ({
  version: 1,
  nodes: Array.from(nodes.values(), cloneNode),
});

const serializeState = (nodes) => JSON.stringify(exportState(nodes));

const deserializeState = (serialized) => {
  if (!serialized || typeof serialized !== 'string') return new Map();
  try {
    return normalizeState(JSON.parse(serialized));
  } catch {
    return new Map();
  }
};

const compareIds = (a, b) => b.localeCompare(a);

/** Return all node ids in deterministic document order, including tombstones. */
const orderedIds = (nodes) => {
  const children = new Map();

  const addChild = (parent, id) => {
    const key = parent || '__root__';
    const list = children.get(key) || [];
    list.push(id);
    children.set(key, list);
  };

  for (const node of nodes.values()) {
    // Missing/tombstoned parents are still valid insertion anchors. Treat a
    // missing parent as root so partially persisted/merged states remain usable.
    addChild(node.after && nodes.has(node.after) ? node.after : null, node.id);
  }

  for (const list of children.values()) list.sort(compareIds);

  const result = [];
  const visit = (parent) => {
    const key = parent || '__root__';
    const list = children.get(key) || [];
    for (const id of list) {
      result.push(id);
      visit(id);
    }
  };

  visit(null);
  return result;
};

const visibleEntries = (nodes) =>
  orderedIds(nodes)
    .map((id) => nodes.get(id))
    .filter(Boolean)
    .filter((node) => !node.deleted);

const visibleText = (nodes) => visibleEntries(nodes).map((node) => node.char).join('');

const createInitialState = (text = '') => {
  const nodes = new Map();
  let previous = null;
  for (let index = 0; index < text.length && nodes.size < MAX_NODES; index += 1) {
    const id = `bootstrap:${index}`;
    const node = { id, char: text[index], after: previous, deleted: false };
    nodes.set(id, node);
    previous = id;
  }
  return nodes;
};

const applyOperation = (nodes, operation) => {
  if (!operation || typeof operation !== 'object') return false;
  if (operation.type === 'insert') {
    if (!Array.isArray(operation.nodes) || operation.nodes.length === 0) return false;
    let changed = false;
    for (const raw of operation.nodes) {
      if (!raw || typeof raw.id !== 'string' || typeof raw.char !== 'string') continue;
      if (raw.char.length !== 1 || raw.id.length > 160) continue;
      if (nodes.has(raw.id)) continue;
      if (nodes.size >= MAX_NODES) break;
      nodes.set(raw.id, {
        id: raw.id,
        char: raw.char,
        after: raw.after ?? null,
        deleted: false,
      });
      changed = true;
    }
    return changed;
  }

  if (operation.type === 'delete') {
    if (!Array.isArray(operation.ids)) return false;
    let changed = false;
    for (const id of operation.ids) {
      const node = nodes.get(id);
      if (!node || node.deleted) continue;
      node.deleted = true;
      changed = true;
    }
    return changed;
  }

  return false;
};

/**
 * Convert a Monaco/editor full-text change into one CRDT operation.
 * For an arbitrary edit, the smallest changed contiguous region is replaced.
 * Multiple disjoint Monaco changes are coalesced into one deterministic range.
 */
const createReplaceOperation = (nodes, nextText, clientId, nextCounter) => {
  if (typeof nextText !== 'string') throw new Error('Document text must be a string.');
  const entries = visibleEntries(nodes);
  const previousText = entries.map((entry) => entry.char).join('');

  let prefix = 0;
  while (
    prefix < previousText.length &&
    prefix < nextText.length &&
    previousText.charCodeAt(prefix) === nextText.charCodeAt(prefix)
  ) {
    prefix += 1;
  }

  let previousEnd = previousText.length;
  let nextEnd = nextText.length;
  while (
    previousEnd > prefix &&
    nextEnd > prefix &&
    previousText.charCodeAt(previousEnd - 1) === nextText.charCodeAt(nextEnd - 1)
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  const deleteIds = entries.slice(prefix, previousEnd).map((entry) => entry.id);
  const predecessor = prefix > 0 ? entries[prefix - 1].id : null;
  const insertedText = nextText.slice(prefix, nextEnd);

  const insertNodes = [];
  let after = predecessor;
  let counter = Number(nextCounter) || 0;
  for (const char of insertedText) {
    counter += 1;
    const id = `${clientId}:${counter}`;
    insertNodes.push({ id, char, after });
    after = id;
  }

  const operation = {
    opId: `${clientId}:${counter || Date.now()}`,
    type: 'replace',
    insert: insertNodes,
    deleteIds,
  };

  return { operation, nextCounter: counter };
};

const applyReplaceOperation = (nodes, operation) => {
  let changed = false;
  if (Array.isArray(operation.deleteIds)) {
    changed = applyOperation(nodes, { type: 'delete', ids: operation.deleteIds }) || changed;
  }
  if (Array.isArray(operation.insert)) {
    changed = applyOperation(nodes, { type: 'insert', nodes: operation.insert }) || changed;
  }
  return changed;
};

module.exports = {
  MAX_NODES,
  createInitialState,
  deserializeState,
  serializeState,
  visibleText,
  visibleEntries,
  orderedIds,
  applyOperation,
  applyReplaceOperation,
  createReplaceOperation,
};
