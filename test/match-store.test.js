'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createMatchStore } = require('../lib/match-store');
const state = require('../public/script/match-state');
const { fixture } = require('./fixtures');
const makeChange = (data, p, value) => ({ path: p, previous: state.at(data, p), value });
const blue = ['teamdata', 'blueteam'];

test('concurrent edits from the same snapshot preserve unrelated fields', async () => {
  const initial = fixture(), persisted = [];
  const store = createMatchStore({ initial, persist: async (_, body) => persisted.push(JSON.parse(body)) });
  await Promise.all([
    store.patch([makeChange(initial, [...blue, 'score'], '1')]),
    store.patch([makeChange(initial, ['game_duration'], '03:12')]),
  ]);
  const { data } = store.snapshot();
  assert.equal(data.teamdata.blueteam.score, '1');
  assert.equal(data.game_duration, '03:12');
  assert.deepEqual(persisted.at(-1), data);
});

test('same-field conflict rejects the whole batch without publishing or writing', async () => {
  const initial = fixture(); let writes = 0, events = 0;
  const store = createMatchStore({ initial, persist: async () => writes++, onCommit: () => events++ });
  const change = makeChange(initial, [...blue, 'score'], '1');
  await store.patch([change]);
  await assert.rejects(store.patch([{ ...change, value: '2' }, makeChange(initial, ['game_duration'], '02:00')]), { status: 409 });
  assert.equal(store.snapshot().data.game_duration, '00:00');
  assert.equal(writes, 1); assert.equal(events, 1);
});

test('failed persistence keeps previous memory/revision, emits nothing and queue recovers', async () => {
  let fail = true, events = 0;
  const initial = fixture();
  const store = createMatchStore({ initial, persist: async () => { if (fail) throw Error('disk unavailable'); }, onCommit: () => events++ });
  const before = store.snapshot();
  await assert.rejects(store.patch([makeChange(initial, ['game_duration'], '01:00')]), /disk unavailable/);
  assert.deepEqual(store.snapshot(), before); assert.equal(events, 0);
  fail = false;
  await store.patch([makeChange(initial, ['game_duration'], '01:00')]);
  assert.equal(events, 1);
});

test('commit is visible only after persistence completes', async () => {
  let release; const initial = fixture();
  const store = createMatchStore({ initial, persist: () => new Promise(resolve => { release = resolve; }) });
  const pending = store.patch([makeChange(initial, ['game_duration'], '01:00')]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(store.snapshot().data, initial);
  release(); await pending;
  assert.equal(store.snapshot().data.game_duration, '01:00');
});

test('guards stop postgame edits from crossing a match or lineup change', async () => {
  const initial = fixture(); const store = createMatchStore({ initial, persist: async () => {} });
  await store.patch([makeChange(initial, ['game_number'], 2)]);
  await assert.rejects(store.patch([makeChange(initial, [...blue, 'turret'], '3')], state.editorGuards(initial)), { status: 409 });
  assert.equal(store.snapshot().data.teamdata.blueteam.turret, 0);
});

test('stale conditional legacy POST is rejected; valid complete replacement stays compatible', async () => {
  const initial = fixture(); const store = createMatchStore({ initial, persist: async () => {} });
  const revision = store.snapshot().revision;
  await store.patch([makeChange(initial, ['game_duration'], '04:00')]);
  await assert.rejects(store.replace(initial, revision), { status: 409 });
  const next = fixture(); next.extensionData = { label: 'preserved' };
  await store.replace(next);
  assert.deepEqual(store.snapshot().data.extensionData, { label: 'preserved' });
});

test('invalid paths, overlapping fields and partial documents cannot mutate match state', async () => {
  const initial = fixture(); const store = createMatchStore({ initial, persist: async () => {} });
  const invalid = [
    [{ path: ['__proto__', 'polluted'], previous: { exists: false }, value: true }],
    [{ path: [...blue, 'playerlist', '99'], previous: { exists: false }, value: {} }],
    [makeChange(initial, blue, initial.teamdata.blueteam), makeChange(initial, [...blue, 'score'], '2')],
  ];
  for (const changes of invalid) await assert.rejects(store.patch(changes), { status: 400 });
  assert.throws(() => store.replace({ game_number: 2 }), { status: 400 });
  assert.equal({}.polluted, undefined);
  assert.deepEqual(store.snapshot().data, initial);
});

test('new optional fields and indexed item edits diff without replacing the roster', () => {
  const initial = fixture(), next = state.clone(initial);
  next.matchInfo = { match: 'Finals' };
  next.teamdata.blueteam.playerlist[0].itemlist[2] = 'oracle';
  const changes = state.diff(initial, next);
  assert.equal(changes.length, 2);
  assert.ok(changes.some(c => c.path.join('.') === 'teamdata.blueteam.playerlist.0.itemlist.2'));
  assert.deepEqual(state.applyChanges(initial, changes), next);
});

test('atomic persisted match survives restart and temporary file is removed', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlbb-store-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'match.json'), initial = fixture();
  const first = createMatchStore({ initial, file });
  await first.patch([makeChange(initial, ['game_duration'], '07:12')]);
  const second = createMatchStore({ initial: JSON.parse(await fs.readFile(file, 'utf8')), file });
  assert.equal(second.snapshot().data.game_duration, '07:12');
  assert.notEqual(first.snapshot().revision, second.snapshot().revision);
  assert.deepEqual(await fs.readdir(dir), ['match.json']);
});
