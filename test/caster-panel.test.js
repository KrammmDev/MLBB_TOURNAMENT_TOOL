"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const {
  createCasterStore,
  loadCasterStore,
  defaults,
} = require("../lib/caster-panel");
test("caster settings persist independently and reject stale or invalid writes", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "casters-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "casters.json"),
    store = await loadCasterStore({ file });
  let snapshot = store.snapshot();
  assert.equal(snapshot.data.visible, false);
  const next = {
    ...snapshot.data,
    visible: true,
    casters: [
      { name: " Athena ", handle: "@athena", role: "SHOUTCASTER" },
      { name: "Wolf", handle: "@wolfcasts", role: "ANALYST" },
    ],
  };
  snapshot = await store.save(next, snapshot.revision);
  assert.equal(snapshot.data.casters[0].name, "Athena");
  await assert.rejects(store.save(next, '"stale"'), (e) => e.status === 409);
  await assert.rejects(
    store.save({ ...next, casters: [] }, snapshot.revision),
    (e) => e.status === 400,
  );
  await assert.rejects(store.save(next, null), (e) => e.status === 428);
  assert.deepEqual(
    (await loadCasterStore({ file })).snapshot().data,
    snapshot.data,
  );
  const failed = createCasterStore({
    initial: defaults(),
    file,
    persist: async () => {
      throw Error("disk failure");
    },
  });
  await assert.rejects(failed.save(next, failed.snapshot().revision));
  assert.equal(failed.snapshot().data.visible, false);
});
