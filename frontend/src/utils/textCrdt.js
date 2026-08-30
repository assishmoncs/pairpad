const MAX_NODES = 750000;

const cloneNode = (node) => ({
  id: node.id,
  char: node.char,
  after: node.after ?? null,
  deleted: Boolean(node.deleted),
});

const compareIds = (a, b) => b.localeCompare(a);

export class TextCrdt {
  constructor(clientId) {
    this.clientId = clientId;
    this.counter = 0;
    this.nodes = new Map();
  }

  resetFromState(serializedState) {
    this.nodes.clear();
    this.counter = 0;

    if (!serializedState) return;
    try {
      const parsed =
        typeof serializedState === 'string' ? JSON.parse(serializedState) : serializedState;
      if (!Array.isArray(parsed?.nodes)) return;

      for (const raw of parsed.nodes) {
        if (!raw || typeof raw.id !== 'string' || typeof raw.char !== 'string') continue;
        if (raw.char.length !== 1 || this.nodes.size >= MAX_NODES) continue;
        this.nodes.set(raw.id, cloneNode(raw));

        if (raw.id.startsWith(`${this.clientId}:`)) {
          const value = Number(raw.id.slice(this.clientId.length + 1));
          if (Number.isSafeInteger(value)) this.counter = Math.max(this.counter, value);
        }
      }
    } catch {
      // Invalid persisted state is ignored; the caller can continue from the
      // current room snapshot supplied by the REST API.
    }
  }

  exportState() {
    return JSON.stringify({
      version: 1,
      nodes: Array.from(this.nodes.values(), cloneNode),
    });
  }

  getOrderedIds() {
    const children = new Map();

    const addChild = (parent, id) => {
      const key = parent || '__root__';
      const list = children.get(key) || [];
      list.push(id);
      children.set(key, list);
    };

    for (const node of this.nodes.values()) {
      addChild(node.after && this.nodes.has(node.after) ? node.after : null, node.id);
    }

    for (const list of children.values()) list.sort(compareIds);

    const result = [];
    const visit = (parent) => {
      const key = parent || '__root__';
      for (const id of children.get(key) || []) {
        result.push(id);
        visit(id);
      }
    };
    visit(null);
    return result;
  }

  getVisibleEntries() {
    return this.getOrderedIds()
      .map((id) => this.nodes.get(id))
      .filter(Boolean)
      .filter((node) => !node.deleted);
  }

  getText() {
    return this.getVisibleEntries()
      .map((node) => node.char)
      .join('');
  }

  applyReplaceOperation(operation) {
    if (!operation || operation.type !== 'replace') return false;
    let changed = false;

    for (const id of operation.deleteIds || []) {
      const node = this.nodes.get(id);
      if (!node || node.deleted) continue;
      node.deleted = true;
      changed = true;
    }

    for (const raw of operation.insert || []) {
      if (!raw || typeof raw.id !== 'string' || typeof raw.char !== 'string') continue;
      if (raw.char.length !== 1 || this.nodes.size >= MAX_NODES || this.nodes.has(raw.id)) continue;
      this.nodes.set(raw.id, {
        id: raw.id,
        char: raw.char,
        after: raw.after ?? null,
        deleted: false,
      });
      changed = true;

      if (raw.id.startsWith(`${this.clientId}:`)) {
        const value = Number(raw.id.slice(this.clientId.length + 1));
        if (Number.isSafeInteger(value)) this.counter = Math.max(this.counter, value);
      }
    }

    return changed;
  }

  replaceText(nextText) {
    if (typeof nextText !== 'string') throw new Error('Document text must be a string.');

    const entries = this.getVisibleEntries();
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
    const insertNodes = [];
    let after = predecessor;

    for (const char of nextText.slice(prefix, nextEnd)) {
      this.counter += 1;
      const id = `${this.clientId}:${this.counter}`;
      const node = { id, char, after, deleted: false };
      this.nodes.set(id, node);
      insertNodes.push({ ...node });
      after = id;
    }

    if (deleteIds.length === 0 && insertNodes.length === 0) return null;

    return {
      opId: `${this.clientId}:${this.counter || Date.now()}`,
      type: 'replace',
      insert: insertNodes,
      deleteIds,
    };
  }
}

export const makeClientId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};
