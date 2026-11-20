"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  http = require("node:http"),
  vm = require("node:vm"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  express = require("express");
const { gunzipSync } = require("node:zlib");
const { createJSONSnapshot } = require("../lib/json-snapshot");
const { mergeSharedState } = require("../lib/shared-state");
function raw(port, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: "/snapshot", headers }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      })
      .on("error", reject);
  });
}
test("large immutable snapshots serialize once, revalidate without bytes and negotiate cached gzip", async (t) => {
  let serializations = 0;
  let data = {
    toJSON() {
      serializations++;
      return { image: "a".repeat(100000), name: "fixture" };
    },
  };
  const app = express(),
    send = createJSONSnapshot();
  app.get("/snapshot", (req, res) => send(req, res, data));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const port = server.address().port;
  const first = await raw(port);
  assert.equal(first.status, 200);
  assert.ok(first.body.length > 100000);
  const same = await raw(port, { "If-None-Match": first.headers.etag });
  assert.equal(same.status, 304);
  assert.equal(same.body.length, 0);
  assert.equal(serializations, 1);
  const gzip = await raw(port, { "Accept-Encoding": "gzip" });
  assert.equal(gzip.headers["content-encoding"], "gzip");
  assert.ok(gzip.body.length < first.body.length / 10);
  assert.deepEqual(gunzipSync(gzip.body), first.body);
  assert.equal(serializations, 1);
  const identity = await raw(port, { "Accept-Encoding": "gzip;q=0, identity" });
  assert.equal(identity.headers["content-encoding"], undefined);
  data = { name: "changed" };
  const changed = await raw(port, { "If-None-Match": first.headers.etag });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.etag, first.headers.etag);
  assert.deepEqual(JSON.parse(changed.body), data);
});
test("snapshot client shares concurrent reads and reuses parsed 304 values after recovery", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "../public/script/snapshot-client.js"),
    "utf8",
  );
  const calls = [];
  let respond;
  let phase = 0;
  const root = {};
  vm.runInNewContext(source, {
    window: root,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: (url, options) => {
      calls.push({ url, options });
      if (phase === 0) return new Promise((r) => (respond = r));
      if (phase === 2) return Promise.resolve({ status: 503, ok: false });
      return Promise.resolve({
        status: 304,
        ok: false,
        json() {
          throw Error("304 must not be parsed");
        },
      });
    },
  });
  const one = root.SnapshotClient.read("/api/schedule"),
    two = root.SnapshotClient.read("/api/schedule");
  assert.equal(calls.length, 1);
  const payload = { matches: [{ name: "A" }] };
  respond({
    status: 200,
    ok: true,
    headers: { get: () => 'W/"one"' },
    json: async () => payload,
  });
  assert.equal(await one, payload);
  assert.equal(await two, payload);
  phase = 1;
  assert.equal(await root.SnapshotClient.read("/api/schedule"), payload);
  assert.equal(calls.at(-1).options.headers["If-None-Match"], 'W/"one"');
  phase = 2;
  await assert.rejects(root.SnapshotClient.read("/api/schedule"));
  phase = 1;
  assert.equal(await root.SnapshotClient.read("/api/schedule"), payload);
});
test("shared-state merge skips unchanged persistence while preserving update, init and deletion semantics", () => {
  const state = {
    text: "saved",
    timer: { time: 50 },
    large: "a".repeat(100000),
  };
  assert.equal(
    mergeSharedState(state, {
      text: "saved",
      timer: { time: 50 },
      large: state.large,
    }),
    false,
  );
  assert.equal(mergeSharedState(state, { text: null }), false);
  assert.equal(state.text, "saved");
  assert.equal(mergeSharedState(state, { text: null }, true), true);
  assert.equal(Object.hasOwn(state, "text"), false);
  assert.equal(mergeSharedState(state, { timer: { time: 49 } }), true);
  assert.equal(state.timer.time, 49);
  assert.equal(
    mergeSharedState(state, JSON.parse('{"__proto__":{"value":1}}')),
    true,
  );
  assert.equal(Object.getPrototypeOf(state), Object.prototype);
});
