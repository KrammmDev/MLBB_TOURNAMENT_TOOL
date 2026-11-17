"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const express = require("express");
const {
  createRosterThemeStore,
  loadRosterThemeStore,
  installRosterThemeRoutes,
} = require("../lib/roster-theme-store");
const model = require("../public/script/roster-model");
const { fixture } = require("./fixtures");
const initial = { schemaVersion: 1, themeId: "classic", previousThemeId: null };
test("theme selection is revision guarded, serialized, recoverable and committed before notification", async () => {
  let fail = false,
    writes = 0,
    events = 0;
  const store = createRosterThemeStore({
    initial,
    persist: async () => {
      if (fail) throw Error("disk full");
      writes++;
    },
    onCommit: () => events++,
  });
  const revision = store.snapshot().revision;
  await assert.rejects(store.select("arena"), { status: 428 });
  await assert.rejects(store.select("unknown", revision), { status: 400 });
  const results = await Promise.allSettled([
    store.select("arena", revision),
    store.select("studio", revision),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].reason.status, 409);
  assert.equal(store.snapshot().data.previousThemeId, "classic");
  assert.equal(writes, 1);
  assert.equal(events, 1);
  fail = true;
  const before = store.snapshot();
  await assert.rejects(store.select("studio", before.revision), /disk full/);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(events, 1);
  fail = false;
  await store.select("classic", before.revision);
  assert.equal(store.snapshot().data.previousThemeId, "arena");
});
test("theme settings persist through restart; corrupt configuration is retained", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mlbb-theme-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "runtime", "roster-theme.json");
  const store = await loadRosterThemeStore({ file });
  await store.select("studio", store.snapshot().revision);
  const restarted = await loadRosterThemeStore({ file });
  assert.equal(restarted.snapshot().data.themeId, "studio");
  await fs.writeFile(file, "{broken");
  await assert.rejects(
    loadRosterThemeStore({ file }),
    /Cannot load roster theme safely/,
  );
  assert.equal(await fs.readFile(file, "utf8"), "{broken");
});
test("theme HTTP catalog and selection do not expose legacy theme mutation semantics", async (t) => {
  const store = createRosterThemeStore({ initial, persist: async () => {} }),
    app = express();
  app.use(express.json());
  installRosterThemeRoutes(app, () => store);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const catalog = await (await fetch(base + "/api/roster-themes")).json();
  assert.equal(catalog.themes.length, 3);
  assert.ok(
    catalog.themes.every(
      (theme) =>
        theme.outputs.length === 5 &&
        theme.outputs.includes("roster") &&
        theme.outputs.includes("draft") &&
        theme.outputs.includes("scoreboard") &&
        theme.outputs.includes("postdraft"),
    ),
  );
  const response = await fetch(base + "/api/roster-theme");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const snapshot = await response.json();
  const put = (revision) =>
    fetch(base + "/api/roster-theme", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(revision ? { "If-Match": revision } : {}),
      },
      body: JSON.stringify({ themeId: "arena" }),
    });
  assert.equal((await put()).status, 428);
  assert.equal((await put(snapshot.revision)).status, 200);
  assert.equal((await put(snapshot.revision)).status, 409);
});
test("roster identity includes full image URL and renders safe image sources", () => {
  const data = fixture();
  data.teamdata.blueteam.playerlist[0].image = "/Assets/player/a.png";
  const first = model.key(model.pairs(data)[0]);
  data.teamdata.blueteam.playerlist[0].image = "/Assets/player/b.png";
  assert.notEqual(first, model.key(model.pairs(data)[0]));
  assert.equal(model.safeImage("Assets/logo.png"), "/Assets/logo.png");
  for (const src of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "/Assets/../secret",
  ])
    assert.equal(model.safeImage(src), "");
  assert.ok(model.pairs(data)[0].blue.images.includes("/Assets/player/b.png"));
});

test("output selections isolate look/history, survive restart and preserve legacy look", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mlbb-output-theme-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "theme.json");
  const store = await loadRosterThemeStore({ file });
  await store.select("arena", store.snapshot().revision);
  await store.select("studio", store.snapshot().revision, "draft");
  const catalog = require("../public/script/roster-themes");
  let config = store.snapshot().data;
  assert.equal(catalog.selection(config, "draft").themeId, "studio");
  for (const output of ["roster", "scoreboard", "postdraft"])
    assert.equal(catalog.selection(config, output).themeId, "arena");
  await store.select("classic", store.snapshot().revision, "scoreboard");
  const restarted = await loadRosterThemeStore({ file });
  config = restarted.snapshot().data;
  assert.deepEqual(catalog.selection(config, "scoreboard"), {
    themeId: "classic",
    previousThemeId: "arena",
  });
  assert.deepEqual(catalog.selection(config, "draft"), {
    themeId: "studio",
    previousThemeId: "arena",
  });
  const before = restarted.snapshot();
  await assert.rejects(
    restarted.select("studio", before.revision, "bad-output"),
    { status: 400 },
  );
  assert.deepEqual(restarted.snapshot(), before);
  const copy = restarted.snapshot();
  copy.data.selections.draft.themeId = "classic";
  assert.equal(
    catalog.selection(restarted.snapshot().data, "draft").themeId,
    "studio",
  );
});
