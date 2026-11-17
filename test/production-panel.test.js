"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createPanelStore, loadPanelStore } = require("../lib/production-panel");
const timer = require("../public/script/production-timer-model");
test("independent timer anchors pause/resume, expiry, reset, formats and write conflicts", async () => {
  let now = 1000,
    fail = false;
  const store = createPanelStore({
    now: () => now,
    persist: async () => {
      if (fail) throw Error("disk full");
    },
  });
  const change = (body) => store.change(body, store.snapshot().revision);
  await assert.rejects(store.change({ action: "start" }), { status: 428 });
  await change({
    action: "settings",
    settings: { durationSeconds: 2, endText: "READY" },
  });
  await change({ action: "start" });
  now += 700;
  await change({ action: "pause" });
  assert.equal(store.snapshot().data.valueMs, 1300);
  now += 5000;
  assert.equal(timer.milliseconds(store.snapshot().data, now), 1300);
  await change({ action: "start" });
  now += 1400;
  assert.equal(timer.text(store.snapshot().data, now), "READY");
  await change({ action: "start" });
  assert.equal(timer.milliseconds(store.snapshot().data, now), 2000);
  await change({ action: "reset" });
  assert.equal(store.snapshot().data.running, false);
  await change({ action: "settings", settings: { mode: "countup" } });
  await change({ action: "start" });
  now += 3661000;
  assert.equal(timer.text(store.snapshot().data, now), "61:01");
  await change({ action: "settings", settings: { format: "%0h:%0m:%0s" } });
  assert.equal(timer.text(store.snapshot().data, now), "01:01:01");
  const old = store.snapshot();
  await assert.rejects(store.change({ action: "pause" }, "stale"), {
    status: 409,
  });
  fail = true;
  await assert.rejects(change({ action: "pause" }), /disk full/);
  assert.deepEqual(store.snapshot(), old);
});
test("panel settings survive restart and corrupt state is preserved", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "panel-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "panel.json");
  const a = await loadPanelStore({ file });
  await a.change(
    {
      action: "settings",
      settings: { ticker: "Hello <script>", accent: "#ff00ff" },
    },
    a.snapshot().revision,
  );
  const b = await loadPanelStore({ file });
  assert.equal(b.snapshot().data.ticker, "Hello <script>");
  await fs.writeFile(file, "broken");
  await assert.rejects(loadPanelStore({ file }), /safely/);
  assert.equal(await fs.readFile(file, "utf8"), "broken");
});
