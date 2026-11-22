"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { installBuildRecognitionRoutes } = require("../lib/build-recognition-routes");

test("recognition route can initialize without optional equipment slot map", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mlbb-recognition-startup-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, "public", "database"), { recursive: true });
  const app = express();
  installBuildRecognitionRoutes(app, { root: dir });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const state = await fetch(base + "/api/build-recognition/state");
  assert.equal(state.status, 200);
  assert.equal((await state.json()).active, false);

  const image = Buffer.from("89504e470d0a1a0a", "hex");
  const scan = await fetch(base + "/api/build-recognition/scan", {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: image,
  });
  assert.equal(scan.status, 503);
  assert.match((await scan.json()).error, /Equipment slot map is missing/);
});
