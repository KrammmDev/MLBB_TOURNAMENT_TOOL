'use strict';
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { clone, applyChanges, validateMatch } = require('../public/script/match-state');

// Commit memory only after the complete file has been atomically replaced.
async function atomicWrite(file, payload) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, payload, { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
function createMatchStore({ initial, file, persist = atomicWrite, onCommit = () => {} }) {
  validateMatch(initial);
  let data = clone(initial);
  const epoch = randomUUID();
  let version = 0;
  let tail = Promise.resolve();
  const revision = () => `"${epoch}:${version}"`;
  const snapshot = () => ({ data: clone(data), revision: revision() });
  function enqueue(transform, expectedRevision) {
    const pending = tail.then(async () => {
      if (expectedRevision !== undefined && expectedRevision !== revision()) {
        const error = new Error('Match revision is stale'); error.status = 409; throw error;
      }
      const next = transform(data);
      validateMatch(next);
      if (isDeepStrictEqual(next, data)) return snapshot();
      await persist(file, JSON.stringify(next, null, 2));
      data = next;
      version++;
      const committed = snapshot();
      try { onCommit(committed); }
      catch (error) { console.error("Match committed but notification failed:", error.message); }
      return committed;
    });
    tail = pending.catch(() => {}); // A failed write must not poison subsequent requests.
    return pending;
  }
  return {
    snapshot,
    replace(value, expectedRevision) {
      validateMatch(value);
      const next = clone(value);
      return enqueue(() => next, expectedRevision);
    },
    patch(changes, guards, expectedRevision) {
      const input = clone({ changes, guards: guards === undefined ? [] : guards });
      return enqueue(current => applyChanges(current, input.changes, input.guards), expectedRevision);
    },
  };
}
module.exports = { createMatchStore, atomicWrite };
