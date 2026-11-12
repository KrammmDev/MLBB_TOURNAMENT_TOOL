"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  express = require("express");
const {
  createBrandingStore,
  loadBrandingStore,
  installBrandingRoutes,
} = require("../lib/scoreboard-branding");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1sAAAAASUVORK5CYII=",
  "base64",
);
test("scoreboard details upload/save, revisions, restart and clear", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "branding-")),
    file = path.join(dir, "settings.json"),
    images = path.join(dir, "images");
  let events = 0,
    store = await loadBrandingStore({ file, onCommit: () => events++ });
  const app = express();
  app.use(express.json());
  installBrandingRoutes(app, () => store, images);
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = store.snapshot();
  const save = (revision, body) =>
    fetch(base + "/api/scoreboard-branding", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(revision ? { "If-Match": revision } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await save(null, { patchLabel: "patch", casterNames: "caster" })).status,
    428,
  );
  let response = await save(initial.revision, {
    patchLabel: " STARWARD DECADE 1014 ",
    casterNames: "MARSU | MIKAEL",
  });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.data.patchLabel, "STARWARD DECADE 1014");
  assert.equal(
    (await save(initial.revision, { patchLabel: "old", casterNames: "old" }))
      .status,
    409,
  );
  assert.equal(
    (
      await save(saved.revision, {
        patchLabel: "x".repeat(65),
        casterNames: "",
      })
    ).status,
    400,
  );
  async function upload(revision, bytes = png) {
    const form = new FormData();
    form.append("logo", new Blob([bytes]), "../../logo.png");
    return fetch(base + "/api/scoreboard-branding/logo", {
      method: "POST",
      headers: { "If-Match": revision },
      body: form,
    });
  }
  assert.equal(
    (await upload(saved.revision, Buffer.from("<svg/>"))).status,
    400,
  );
  response = await upload(saved.revision);
  assert.equal(response.status, 201);
  const uploaded = await response.json();
  assert.match(uploaded.data.logoFile, /^[a-f0-9-]{36}\.png$/);
  assert.equal(
    (await fetch(base + "/scoreboard-branding/" + uploaded.data.logoFile))
      .status,
    200,
  );
  assert.equal((await upload(saved.revision)).status, 409);
  assert.equal((await fs.readdir(images)).length, 1);
  assert.equal(events, 2);
  store = await loadBrandingStore({ file });
  assert.deepEqual(store.snapshot().data, uploaded.data);
  response = await save(store.snapshot().revision, {
    patchLabel: "",
    casterNames: "",
  });
  assert.equal(response.status, 200);
  assert.equal(store.snapshot().data.logoFile, uploaded.data.logoFile);
  response = await fetch(base + "/api/scoreboard-branding/logo", {
    method: "DELETE",
    headers: { "If-Match": store.snapshot().revision },
  });
  assert.equal(response.status, 200);
  assert.equal(store.snapshot().data.logoFile, null);
  await fs.writeFile(file, "broken");
  await assert.rejects(
    loadBrandingStore({ file }),
    /Cannot load scoreboard details safely/,
  );
  assert.equal(await fs.readFile(file, "utf8"), "broken");
});
test("failed branding persistence retains state and revision, queue recovers", async () => {
  let fail = true,
    events = 0;
  const store = createBrandingStore({
      persist: async () => {
        if (fail) throw Error("disk failure");
      },
      onCommit: () => events++,
    }),
    before = store.snapshot();
  await assert.rejects(
    store.change((data) => ({ ...data, patchLabel: "patch" }), before.revision),
    /disk failure/,
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(events, 0);
  fail = false;
  await store.change(
    (data) => ({ ...data, patchLabel: "patch" }),
    before.revision,
  );
  assert.equal(events, 1);
});
