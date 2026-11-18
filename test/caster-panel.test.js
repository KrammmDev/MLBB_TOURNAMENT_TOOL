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

test("VDO links accept receive-only Ninja URLs and normalize legacy caster settings", async () => {
  const { safeURL, embedURL } = require("../public/script/caster-vdo-model");
  for (const value of [
    "javascript:alert(1)",
    "https://evil.example/?view=x",
    "https://vdo.ninja/?push=x",
    "https://vdo.ninja/?view=x&push=y",
    "https://vdo.ninja/?room=x",
    "http://vdo.ninja/?view=x",
  ]) {
    assert.equal(safeURL(value), "");
  }
  assert.ok(embedURL("https://vdo.ninja/?view=alpha").includes("autostart"));
  const legacy = {
    schemaVersion: 1,
    visible: false,
    namesVisible: true,
    casters: [
      { name: "A", handle: "", role: "" },
      { name: "B", handle: "", role: "" },
    ],
  };
  const store = createCasterStore({ initial: legacy, persist: async () => {} });
  assert.equal(store.snapshot().data.casters[0].onAir, true);
  assert.equal(store.snapshot().data.casters[0].vdoUrl, "");
  const next = store.snapshot().data;
  next.casters[0].vdoUrl = "https://evil.example/?view=x";
  await assert.rejects(
    store.save(next, store.snapshot().revision),
    (e) => e.status === 400,
  );
});
