/* One explicit, guarded match-write session shared by both control-panel variants. */
(function (root) {
  'use strict';
  const api = root.MatchDataClient;
  let data = null, remote = null, pending = 0, blocked = null, tail = Promise.resolve();
  let flushingTimers = false;
  const timers = new Map(), dirty = new Set(), listeners = new Set();
  const editing = () => document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
  const statusEl = () => document.getElementById('control-save-status');
  function status(message, error = false) {
    const el = statusEl();
    if (el) { el.textContent = message; el.dataset.error = String(error); }
    const button = document.getElementById('control-reload');
    if (button) { button.hidden = !blocked; button.disabled = pending > 0; }
  }
  function emit() { if (data) for (const listener of listeners) listener(api.clone(data)); }
  function flushRemote() {
    if (!remote || pending || timers.size || dirty.size || blocked || editing()) return;
    data = api.clone(remote.data); remote = null; emit();
  }
  function remember(snapshot) {
    // A read or acknowledgement can finish after a newer event from the same server epoch.
    const parse = revision => /^"(.+):(\d+)"$/.exec(revision || '');
    const a = parse(remote?.revision), b = parse(snapshot.revision);
    if (a && b && a[1] === b[1] && Number(a[2]) > Number(b[2])) return;
    remote = snapshot; flushRemote();
  }
  function markDirty(el) { if (el) dirty.add(el); }
  function clean(el, value) {
    if (el && el.value === value) dirty.delete(el);
    flushRemote();
  }
  function flushTimers() {
    if (flushingTimers) return;
    flushingTimers = true;
    const jobs = [...timers.values()]; timers.clear();
    for (const job of jobs) { clearTimeout(job.timer); job.run(); }
    flushingTimers = false;
  }
  function defer(key, run, delay = 350) {
    if (blocked) { status('NOT SAVED — reload latest match before continuing.', true); return; }
    clearTimeout(timers.get(key)?.timer);
    const job = { run };
    job.timer = setTimeout(() => { timers.delete(key); run(); }, delay);
    timers.set(key, job);
    status('Waiting to save...');
  }
  function update(mutator) {
    flushTimers();
    if (!data) return ready.then(() => update(mutator));
    if (blocked) return Promise.reject(blocked);
    const before = api.clone(data), next = api.clone(data);
    mutator(next);
    const changes = api.diff(before, next);
    if (!changes.length) return Promise.resolve({ data: api.clone(data) });
    const guards = api.editorGuards(before);
    data = next; pending++; status('Saving...');
    const task = tail.then(async () => {
      if (blocked) throw blocked;
      try {
        const result = await api.patch(changes, guards);
        remember(result);
        return result;
      } catch (error) {
        blocked = error;
        status(error.status === 409
          ? 'NOT SAVED — another panel changed this field or match. Reload to continue.'
          : 'Save failed — reload latest match before continuing.', true);
        throw error;
      }
    }).finally(() => {
      pending--;
      if (!pending && !blocked) { status('Saved'); flushRemote(); }
      else if (blocked) status(statusEl()?.textContent || 'Save failed', true);
    });
    tail = task.catch(() => {}); // Failure is visible and blocks dependent edits, not an unhandled rejection.
    return task;
  }
  async function reload() {
    if (pending) return;
    if ((blocked || dirty.size || timers.size) && !confirm('Discard unsaved local edits and load the current match?')) return;
    for (const job of timers.values()) clearTimeout(job.timer);
    timers.clear(); dirty.clear();
    try {
      const snapshot = await api.read();
      blocked = null; remote = null; data = api.clone(snapshot.data); tail = Promise.resolve();
      emit(); status('Ready');
      document.querySelector('.content-wrapper')?.removeAttribute('inert');
      document.dispatchEvent(new Event('control-match-reloaded'));
    } catch (error) { blocked = error; status('Reload failed — check server connection and retry.', true); }
  }
  const ready = api.read().then(snapshot => {
    data = api.clone(snapshot.data); emit(); status('Ready');
    document.querySelector('.content-wrapper')?.removeAttribute('inert');
    return snapshot;
  }).catch(error => { blocked = error; status('Cannot load match — check server and reload.', true); throw error; });
  ready.catch(() => {});
  document.addEventListener('focusout', () => setTimeout(flushRemote, 0));
  root.addEventListener('beforeunload', event => {
    if (pending || timers.size || dirty.size || blocked) { event.preventDefault(); event.returnValue = ''; }
  });
  api.subscribe(remember, connection => {
    const el = document.getElementById('control-connection');
    if (el) el.textContent = { connecting: 'Connecting...', connected: 'Live sync connected',
      reconnecting: 'Reconnecting...', offline: 'Server unavailable' }[connection] || connection;
  });
  root.ControlMatch = { ready, update, defer, markDirty, clean, reload,
    get: () => data && api.clone(data),
    onChange(listener) { listeners.add(listener); if (data) listener(api.clone(data)); },
    status: () => ({ pending, blocked: Boolean(blocked), dirty: dirty.size, timers: timers.size }),
  };
})(window);
