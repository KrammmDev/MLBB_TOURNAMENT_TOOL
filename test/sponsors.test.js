"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const express = require("express");
const {
  createSponsorStore,
  loadSponsorStore,
  installSponsorRoutes,
} = require("../lib/broadcast-sponsors");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1sAAAAASUVORK5CYII=",
  "base64",
);
test("sponsor uploads, order, conflicts, deletion and restart preserve acknowledged settings", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sponsors-"));
  const file = path.join(directory, "sponsors.json"),
    logos = path.join(directory, "logos");
  const committed = [];
  let store = await loadSponsorStore({
    file,
    onCommit: (snapshot) => committed.push(snapshot),
  });
  const app = express();
  app.use(express.json());
  installSponsorRoutes(app, () => store, logos);
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const read = async () =>
    (await fetch(base + "/api/broadcast-sponsors")).json();
  const upload = (revision, bytes = png, name = "logo.png") => {
    const data = new FormData();
    data.append("logo", new Blob([bytes]), name);
    return fetch(base + "/api/broadcast-sponsors/logos", {
      method: "POST",
      headers: { "If-Match": revision },
      body: data,
    });
  };
  const initial = await read();
  let response = await upload(initial.revision);
  assert.equal(response.status, 201);
  const first = await response.json();
  assert.equal(first.data.logos.length, 1);
  assert.equal(
    (await fetch(base + "/broadcast-sponsors/" + first.data.logos[0].file))
      .status,
    200,
  );
  response = await upload(initial.revision);
  assert.equal(response.status, 409);
  assert.equal(
    (await fs.readdir(logos)).length,
    1,
    "stale upload file is cleaned up",
  );
  response = await upload(first.revision, Buffer.from("<svg/>"), "fake.png");
  assert.equal(response.status, 400);
  assert.equal((await read()).revision, first.revision);
  response = await upload(first.revision, png, "second.png");
  assert.equal(response.status, 201);
  const second = await response.json();
  const save = (body) =>
    fetch(base + "/api/broadcast-sponsors", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": store.snapshot().revision,
      },
      body: JSON.stringify(body),
    });
  response = await save({
    enabled: true,
    intervalSeconds: 1,
    logoIds: second.data.logos.map((x) => x.id),
  });
  assert.equal(response.status, 400);
  const ids = second.data.logos.map((x) => x.id).reverse();
  response = await save({ enabled: false, intervalSeconds: 2, logoIds: ids });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(
    saved.data.logos.map((x) => x.id),
    ids,
  );
  store = await loadSponsorStore({ file });
  assert.deepEqual(store.snapshot().data, saved.data);
  response = await save({
    enabled: true,
    intervalSeconds: 3,
    logoIds: [ids[0]],
  });
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal((await fs.readdir(logos)).length, 1);
  assert.equal(committed.length, 3);
});
test("failed sponsor persistence publishes nothing and queue recovers", async () => {
  let fail = true;
  const events = [];
  const store = createSponsorStore({
    persist: async () => {
      if (fail) throw Error("disk full");
    },
    onCommit: (x) => events.push(x),
  });
  const before = store.snapshot();
  await assert.rejects(
    store.change((data) => ({ ...data, enabled: false }), before.revision),
    /disk full/,
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(events.length, 0);
  fail = false;
  await store.change((data) => ({ ...data, enabled: false }), before.revision);
  assert.equal(store.snapshot().data.enabled, false);
  assert.equal(events.length, 1);
});
