"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  express = require("express");
const {
  createColorStore,
  loadColorStore,
  installColorRoutes,
} = require("../lib/broadcast-colors");
test("color settings isolate theme/output, reject stale/invalid writes and survive reset/restart", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "broadcast-colors-")),
    file = path.join(dir, "colors.json"),
    events = [];
  const store = await loadColorStore({
    file,
    onCommit: (result) => events.push(result),
  });
  const app = express();
  app.use(express.json());
  installColorRoutes(app, () => store);
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/broadcast-colors`;
  const initial = await (await fetch(url)).json();
  const save = (body, revision = store.snapshot().revision) =>
    fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(revision ? { "If-Match": revision } : {}),
      },
      body: JSON.stringify(body),
    });
  let response = await save({
    themeId: "arena",
    output: "draft",
    colors: { left: "#AA22BB" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.palettes.arena.draft, {
    left: "#aa22bb",
  });
  response = await save(
    { themeId: "arena", output: "draft", colors: { left: "#ffffff" } },
    initial.revision,
  );
  assert.equal(response.status, 409);
  for (const body of [
    { themeId: "bad", output: "draft", colors: {} },
    { themeId: "arena", output: "draft", colors: { left: "red;display:none" } },
    { themeId: "arena", output: "roster", colors: { width: "#ffffff" } },
    { themeId: "arena", output: "draft", colors: null },
  ]) {
    response = await save(body);
    assert.equal(response.status, 400);
  }
  response = await save(
    { themeId: "studio", output: "roster", colors: {} },
    null,
  );
  assert.equal(response.status, 428);
  response = await save({
    themeId: "arena",
    output: "roster",
    colors: { right: "#112233" },
  });
  assert.equal(response.status, 200);
  response = await save({
    themeId: "studio",
    output: "draft",
    colors: { background: "#010203" },
  });
  assert.equal(response.status, 200);
  const restored = await loadColorStore({ file });
  assert.deepEqual(restored.snapshot().data, store.snapshot().data);
  response = await save({ themeId: "arena", output: "draft", colors: {} });
  assert.equal(response.status, 200);
  assert.deepEqual(store.snapshot().data.palettes.arena.draft, {});
  assert.deepEqual(store.snapshot().data.palettes.arena.roster, {
    right: "#112233",
  });
  assert.deepEqual(store.snapshot().data.palettes.studio.draft, {
    background: "#010203",
  });
  assert.equal(events.length, 4);
});
test("failed color persistence leaves acknowledged settings intact and queue recovers", async () => {
  let failed = true;
  const events = [];
  const store = createColorStore({
    persist: async () => {
      if (failed) throw Error("disk full");
    },
    onCommit: (x) => events.push(x),
  });
  const before = store.snapshot();
  await assert.rejects(
    store.save("classic", "roster", { text: "#123456" }, before.revision),
    /disk full/,
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(events.length, 0);
  failed = false;
  await store.save("classic", "roster", { text: "#123456" }, before.revision);
  assert.equal(events.length, 1);
});
test("corrupt saved colors are preserved instead of being overwritten", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bad-colors-")),
    file = path.join(dir, "colors.json");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(file, "broken");
  await assert.rejects(
    loadColorStore({ file }),
    /Cannot load broadcast colors safely/,
  );
  assert.equal(await fs.readFile(file, "utf8"), "broken");
});

test("legacy palettes migrate once; draft and scoreboard saves/resets remain independent", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "color-split-")),
    file = path.join(dir, "colors.json");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const legacy = {
    schemaVersion: 1,
    palettes: {
      classic: {
        draft: { background: "#332e2e", left: "#5ed100" },
        roster: { text: "#ffffff" },
      },
      studio: { draft: { right: "#ee1122" }, scoreboard: { right: "#123456" } },
    },
  };
  await fs.writeFile(file, JSON.stringify(legacy));
  let store = await loadColorStore({ file });
  assert.equal(store.snapshot().data.schemaVersion, 2);
  assert.deepEqual(
    JSON.parse(await fs.readFile(file + ".v1.bak", "utf8")),
    legacy,
  );
  assert.deepEqual(
    store.snapshot().data.palettes.classic.scoreboard,
    legacy.palettes.classic.draft,
  );
  assert.deepEqual(
    store.snapshot().data.palettes.classic.roster,
    legacy.palettes.classic.roster,
  );
  assert.equal(
    store.snapshot().data.palettes.studio.scoreboard.right,
    "#123456",
    "existing scoreboard scope is preserved",
  );
  await store.save(
    "classic",
    "draft",
    { left: "#112233" },
    store.snapshot().revision,
  );
  assert.equal(
    store.snapshot().data.palettes.classic.scoreboard.left,
    "#5ed100",
  );
  await store.save("classic", "scoreboard", {}, store.snapshot().revision);
  assert.equal(store.snapshot().data.palettes.classic.draft.left, "#112233");
  store = await loadColorStore({ file });
  assert.deepEqual(
    store.snapshot().data.palettes.classic.scoreboard,
    {},
    "restart does not recopy draft after scoreboard reset",
  );
  assert.equal(store.snapshot().data.palettes.classic.draft.left, "#112233");
});
