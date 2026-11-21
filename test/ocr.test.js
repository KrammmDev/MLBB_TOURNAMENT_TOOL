"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const M = require("../public/script/ocr-model"),
  { loadOCRStore } = require("../lib/ocr-store"),
  { fixture } = require("./fixtures");
const profile = () => ({
  schemaVersion: 1,
  reference: { width: 1920, height: 1080, kind: "camera", sourceKey: "obs" },
  regions: {
    blueKills: {
      x: 0.3,
      y: 0.01,
      width: 0.025,
      height: 0.03,
      mode: "raw",
      scale: 2,
      threshold: 160,
      minScore: 85,
    },
  },
});
function png(roi, ref) {
  const r = M.cropRect(roi, ref.width, ref.height),
    bytes = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.writeUInt32BE(r.width * roi.scale + 16, 16);
  bytes.writeUInt32BE(r.height * roi.scale + 16, 20);
  return "data:image/png;base64," + bytes.toString("base64");
}
async function setup(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-")),
    file = path.join(directory, "ocr.json"),
    match = fixture();
  let clock = 100000,
    rawText = "2";
  const store = await loadOCRStore({
    file,
    getMatch: () => match,
    now: () => clock,
    engine: { recognize: async () => ({ rawText, score: 99 }) },
    ...overrides,
  });
  t.after(async () => {
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const p = profile();
  await store.configure({ profile: p }, store.settings().revision);
  const start = () =>
    store.start({
      generation: store.state().generation,
      expected: M.context(match),
      reference: p.reference,
    });
  let session = start(),
    sequence = 0;
  const body = () => ({
    sessionId: session.sessionId,
    sequence: ++sequence,
    capturedAt: clock,
    reference: p.reference,
    crops: [{ field: "blueKills", png: png(p.regions.blueKills, p.reference) }],
  });
  return {
    store,
    p,
    match,
    file,
    start,
    body,
    advance: (n) => {
      clock += n;
    },
    raw: (s) => {
      rawText = s;
    },
    session: () => session,
    reset: () => {
      session = start();
    },
  };
}
test("OCR grammar keeps unknown separate from zero and preserves native geometry", () => {
  for (const bad of ["", null, undefined, "O", "-1", "1x", {}, "1:99"])
    assert.equal(M.parse("blueKills", bad), null);
  assert.equal(M.parse("blueKills", "0"), 0);
  assert.equal(M.parse("blueTower", "12"), null);
  assert.equal(M.parse("blueGold", "13.3k"), 13300);
  // OCR-only recovery: a missing decimal must not change manual parsing.
  assert.equal(M.parseOCR("blueGold", "123k"), 12300);
  assert.equal(M.parseOCR("redGold", "267K"), 26700);
  assert.equal(M.parseOCR("blueGold", "12.3k"), 12300);
  assert.equal(M.parseOCR("redGold", "9.8k"), 9800);
  assert.equal(M.parseOCR("blueGold", "1234k"), null);
  assert.equal(M.parseOCR("blueGold", "123"), 123);
  assert.equal(M.parseOCR("blueKills", "123"), 123);
  assert.equal(M.parse("blueGold", "123k"), 123000);
  assert.equal(M.format("blueGold", M.parseOCR("blueGold", "123k")), "12.3K");
  assert.equal(M.parse("blueGold", "13,300"), 13300);
  assert.equal(M.parse("blueGold", "13.3"), null);
  assert.equal(M.parse("timer", "05:20"), 320);
  assert.equal(M.parse("timer", "05:99"), null);
  assert.equal(M.format("timer", null), "--:--");
  const roi = M.pixels({ x: 100, y: 20 }, { x: 160, y: 50 }, 1920, 1080);
  assert.deepEqual(M.cropRect(roi, 1920, 1080), {
    x: 100,
    y: 20,
    width: 60,
    height: 30,
  });
  assert.throws(() =>
    M.validateProfile({
      ...profile(),
      regions: { blueKills: { ...roi, width: 1 } },
    }),
  );
});
test("preview, consecutive confirmation, freshness, manual lock and game invalidation", async (t) => {
  const x = await setup(t),
    { store } = x;
  await store.read(x.body());
  await store.read(x.body());
  assert.equal(store.state().fields.blueKills.accepted, 2);
  assert.equal(store.state().fields.blueKills.value, null);
  store.live(x.session().sessionId);
  await store.read(x.body());
  x.raw("garbage");
  await store.read(x.body());
  x.raw("2");
  await store.read(x.body());
  assert.equal(store.state().fields.blueKills.value, null);
  await store.read(x.body());
  assert.equal(store.state().fields.blueKills.value, 2);
  x.raw("1");
  await store.read(x.body());
  assert.equal(store.state().fields.blueKills.accepted, 2);
  x.advance(4001);
  assert.equal(store.state().fields.blueKills.value, null);
  store.manual({
    generation: store.state().generation,
    field: "blueKills",
    value: "8",
  });
  x.raw("3");
  await store.read(x.body());
  assert.equal(store.state().fields.blueKills.value, 8);
  store.manual({
    generation: store.state().generation,
    field: "blueKills",
    value: null,
  });
  assert.equal(store.state().fields.blueKills.value, null);
  const before = JSON.stringify(x.match);
  x.match.game_number++;
  store.matchChanged();
  assert.equal(store.state().active, false);
  assert.equal(
    JSON.parse(before).teamdata.blueteam.score,
    x.match.teamdata.blueteam.score,
  );
  assert.throws(
    () => store.manual({ generation: "old", field: "blueKills", value: "1" }),
    /changed/,
  );
});
test("reject stale frames, wrong source/crops/order and expired capture leases", async (t) => {
  const x = await setup(t),
    { store } = x;
  await assert.rejects(store.read({ ...x.body(), capturedAt: 0 }), /stale/);
  await assert.rejects(
    store.read({ ...x.body(), reference: { ...x.p.reference, width: 1280 } }),
    /geometry/,
  );
  await assert.rejects(store.read({ ...x.body(), crops: [] }), /exactly/);
  const bad = x.body();
  bad.crops[0].png = bad.crops[0].png.replace("iVBOR", "aaaaa");
  await assert.rejects(store.read(bad), /dimensions/);
  const body = x.body();
  await store.read(body);
  await assert.rejects(store.read(body), /duplicate/);
  x.advance(15001);
  assert.equal(store.state().active, false);
});
test("bounded OCR rejects jobs from prior game or calibration", async (t) => {
  let resolve;
  const x = await setup(t, {
      engine: {
        recognize: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
    }),
    { store } = x;
  const reading = store.read(x.body());
  await assert.rejects(store.read(x.body()), /busy/);
  x.match.game_number++;
  store.matchChanged();
  resolve({ rawText: "99", score: 99 });
  await assert.rejects(reading, /old|changed/);
  assert.equal(store.state().fields.blueKills.accepted, null);
});
test("calibration uses optimistic revisions and atomic persistence; image cannot go live", async (t) => {
  const x = await setup(t),
    { store } = x,
    old = store.settings().revision;
  await store.configure({ source: "custom" }, old);
  await assert.rejects(store.configure({ source: "legacy" }, old), /changed/);
  const saved = JSON.parse(await fs.readFile(x.file, "utf8"));
  assert.equal(saved.source, "custom");
  assert.deepEqual(saved.profile, x.p);
  const restored = await loadOCRStore({
    file: x.file,
    getMatch: () => x.match,
    engine: {},
  });
  assert.equal(restored.state().active, false);
  assert.equal(restored.state().source, "custom");
  const p = { ...x.p, reference: { ...x.p.reference, kind: "image" } };
  await store.configure({ profile: p }, store.settings().revision);
  const result = store.start({
    generation: store.state().generation,
    expected: M.context(x.match),
    reference: p.reference,
  });
  assert.throws(() => store.live(result.sessionId), /preview-only/);
  assert.throws(
    () =>
      store.manual({
        generation: store.state().generation,
        field: "blueKills",
        value: "2",
      }),
    /changed/,
  );
});
test("failed persistence keeps the previous config and revision", async (t) => {
  let fails = false;
  const x = await setup(t, {
      persist: async (file, text) => {
        if (fails) throw Error("disk");
        await fs.writeFile(file, text);
      },
    }),
    before = x.store.settings();
  fails = true;
  await assert.rejects(
    x.store.configure({ source: "custom" }, before.revision),
    /could not be saved/,
  );
  assert.deepEqual(x.store.settings(), before);
});
test("timer and gold allow normal advancement, reject decreases/jumps and low scores", async (t) => {
  let results = {
      timer: { rawText: "05:20", score: 99 },
      blueGold: { rawText: "13.3k", score: 99 },
    },
    index = 0;
  const x = await setup(t, {
      engine: {
        recognize: async () => results[["timer", "blueGold"][index++ % 2]],
      },
    }),
    { store } = x;
  const roi = x.p.regions.blueKills,
    p = { ...x.p, regions: { timer: roi, blueGold: roi } };
  await store.configure({ profile: p }, store.settings().revision);
  const session = store.start({
    generation: store.state().generation,
    expected: M.context(x.match),
    reference: p.reference,
  });
  store.live(session.sessionId);
  let sequence = 0;
  const read = () => {
    const body = x.body();
    return store.read({
      ...body,
      sessionId: session.sessionId,
      sequence: ++sequence,
      crops: Object.entries(p.regions).map(([field, roi]) => ({
        field,
        png: png(roi, p.reference),
      })),
    });
  };
  await read();
  x.advance(1000);
  results.timer.rawText = "05:21";
  results.blueGold.rawText = "13.4k";
  await read();
  assert.equal(store.state().fields.timer.value, 321);
  assert.equal(store.state().fields.blueGold.value, 13400);
  results.blueGold.rawText = "135k"; // 13.5k with decimal missed by OCR
  results.timer.rawText = "05:22";
  x.advance(1000);
  await read();
  assert.equal(store.state().fields.blueGold.value, 13500);
  assert.equal(store.state().fields.blueGold.rawText, "135k");
  results.timer.rawText = "20:00";
  results.blueGold.rawText = "99k";
  await read();
  assert.equal(store.state().fields.timer.value, 322);
  assert.equal(store.state().fields.blueGold.value, 13500);
  results.timer = { rawText: "05:22", score: 30 };
  results.blueGold = { rawText: "13.5k", score: 30 };
  await read();
  assert.equal(store.state().fields.timer.status, "rejected");
  x.advance(4001);
  assert.equal(store.state().fields.timer.value, null);
  assert.equal(store.state().fields.timer.status, "stale");
});
