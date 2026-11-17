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

test("legacy panel configuration gains headline without resetting timer", () => {
  const original = createPanelStore({ persist: async () => {} }).snapshot()
    .data;
  for (const key of [
    "headline",
    "showCurrentMatch",
    "showLowerThird",
    "lowerBackground",
    "headlineColor",
    "tickerBackground",
    "tickerColor",
    "sponsorBackground",
  ])
    delete original[key];
  original.background = "#123456";
  original.text = "#fedcba";
  original.running = true;
  original.startedAt = 1000;
  original.valueMs = 123456;
  const restored = createPanelStore({
    initial: original,
    persist: async () => {},
  }).snapshot().data;
  assert.equal(restored.headline, "");
  assert.equal(restored.lowerBackground, "#123456");
  assert.equal(restored.headlineColor, "#fedcba");
  assert.equal(restored.showCurrentMatch, true);
  assert.equal(restored.showLowerThird, true);
  assert.equal(restored.startedAt, 1000);
  assert.equal(restored.valueMs, 123456);
  assert.equal(restored.running, true);
});

test("visibility cues retain timer anchors and reject invalid targets", async () => {
  const store = createPanelStore({ persist: async () => {}, now: () => 1000 });
  await store.change({ action: "start" }, store.snapshot().revision);
  const before = store.snapshot().data;
  await store.change(
    { action: "visibility", target: "showCurrentMatch", visible: false },
    store.snapshot().revision,
  );
  const next = store.snapshot().data;
  assert.equal(next.startedAt, before.startedAt);
  assert.equal(next.running, true);
  assert.equal(next.valueMs, before.valueMs);
  assert.equal(next.showCurrentMatch, false);
  assert.equal(next.showLowerThird, true);
  await assert.rejects(
    store.change(
      { action: "visibility", target: "bad", visible: false },
      store.snapshot().revision,
    ),
    { status: 400 },
  );
});

test("quick time additions preserve clock state and reset duration", async () => {
  let now = 1000,
    fail = false;
  const store = createPanelStore({
    now: () => now,
    persist: async () => {
      if (fail) throw Error("disk full");
    },
  });
  const change = (body) => store.change(body, store.snapshot().revision);
  const duration = store.snapshot().data.durationSeconds;
  for (const seconds of [60, 180, 300, 600, 1800]) {
    const before = timer.milliseconds(store.snapshot().data, now);
    await change({ action: "add-time", seconds });
    assert.equal(
      timer.milliseconds(store.snapshot().data, now),
      before + seconds * 1000,
    );
    assert.equal(store.snapshot().data.running, false);
    assert.equal(store.snapshot().data.startedAt, null);
  }
  await change({ action: "reset" });
  assert.equal(store.snapshot().data.valueMs, duration * 1000);
  await change({ action: "start" });
  now += 1234;
  const remaining = timer.milliseconds(store.snapshot().data, now);
  await change({ action: "add-time", seconds: 60 });
  assert.equal(store.snapshot().data.running, true);
  assert.equal(
    timer.milliseconds(store.snapshot().data, now),
    remaining + 60000,
  );
  now += 500;
  assert.equal(
    timer.milliseconds(store.snapshot().data, now),
    remaining + 59500,
  );
  now += 9999999;
  await change({ action: "add-time", seconds: 180 });
  assert.equal(timer.milliseconds(store.snapshot().data, now), 180000);
  assert.equal(store.snapshot().data.durationSeconds, duration);
  await change({ action: "settings", settings: { mode: "countup" } });
  await change({ action: "start" });
  now += 1200;
  await change({ action: "add-time", seconds: 300 });
  assert.equal(timer.milliseconds(store.snapshot().data, now), 301200);
  const before = store.snapshot();
  for (const seconds of [0, -60, 61, "60", null])
    await assert.rejects(change({ action: "add-time", seconds }), {
      status: 400,
    });
  await assert.rejects(
    store.change({ action: "add-time", seconds: 60 }, "stale"),
    { status: 409 },
  );
  fail = true;
  await assert.rejects(
    change({ action: "add-time", seconds: 60 }),
    /disk full/,
  );
  assert.deepEqual(store.snapshot(), before);
});
