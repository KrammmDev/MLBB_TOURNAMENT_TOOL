"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const model = require("../public/script/draft-model"),
  { mirrorDraftTimer } = require("../lib/draft-timer");
for (const [format, file] of [
  ["normal", "herodropdown.js"],
  ["six", "herodropdownban6.js"],
]) {
  test(`${format}: display phases match the existing controller array order`, () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../public/script", file),
      "utf8",
    );
    const begin = source.indexOf("const dropdownOrder = "),
      end = source.indexOf("\n];", begin);
    const order = vm.runInNewContext(
      "(" +
        source.slice(begin + "const dropdownOrder = ".length, end + 2) +
        ")",
    );
    const phases = model.formats[format].phases;
    assert.equal(phases.length, order.length);
    for (let i = 0; i < order.length - 1; i++)
      assert.deepEqual(phases[i].slots, Array.from(order[i].display));
    assert.equal(phases.at(-1).type, "ADJUSTMENT");
    assert.deepEqual(phases.at(-1).slots, []);
  });
}
test("zero is a valid clock value; malformed or negative ticks cannot reset the display", () => {
  assert.equal(model.timer("0"), 0);
  assert.equal(model.timer(0), 0);
  assert.equal(model.timer("50"), 50);
  for (const value of ["", false, null, undefined, "bad", -1, Infinity, 1.5])
    assert.equal(model.timer(value), null);
  assert.equal(model.phase({ current_phase: 999 }, "six").type, "ADJUSTMENT");
  assert.deepEqual(model.phase({ current_phase: 7 }, "normal").slots, [
    "pick-right-1",
    "pick-right-2",
  ]);
});
test("timer mirror updates only valid live-clock fields, preserving draft selections and phase", () => {
  const current = {
    draftdata: {
      current_phase: 6,
      timer: "50",
      timer_running: true,
      blueside: { pick: [{ hero: "alpha.png" }] },
    },
  };
  const next = mirrorDraftTimer(current, {
    timer: "0",
    timer_running: false,
    current_phase: 999,
    blueside: {},
  });
  assert.equal(next.draftdata.timer, "0");
  assert.equal(mirrorDraftTimer(current, {timer: "15", timer_running: true, timer_duration: 30}).draftdata.timer_duration, 30);
  assert.equal(mirrorDraftTimer(current, {timer: "15", timer_running: true, timer_duration: -1}).draftdata.timer_duration, undefined);
  assert.equal(next.draftdata.current_phase, 6);
  assert.strictEqual(next.draftdata.blueside, current.draftdata.blueside);
  assert.equal(current.draftdata.timer, "50");
  assert.strictEqual(
    mirrorDraftTimer(next, { timer: "bad", timer_running: true }),
    next,
  );
  assert.strictEqual(
    mirrorDraftTimer(next, { timer: "20", timer_running: "true" }),
    next,
  );
});
test("legacy primary draft displays have unique IDs for every active phase box", () => {
  for (const [name, format] of [
    ["display2.html", "normal"],
    ["display2ban6.html", "six"],
  ]) {
    const html = fs.readFileSync(
      path.join(__dirname, "../public", name),
      "utf8",
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${name} has duplicate IDs`);
    for (const phase of model.formats[format].phases)
      for (const id of phase.slots)
        assert.ok(ids.includes(id), `${name} missing ${id}`);
  }
});

for (const file of ["herodropdown.js", "herodropdownban6.js"]) {
  test(`${file}: configured duration survives next phase, reset and resume`, async () => {
    const ctx = vm.createContext({
      document: {addEventListener() {}, getElementById() {return null}, querySelector() {return null}},
      console, setInterval: () => 1, clearInterval() {},
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/script", file), "utf8"), ctx);
    await vm.runInContext(`
      saveDraftData = async () => {};
      resetMatchDataHeroes = async () => {};
      currentDraftData = {timer: "12", timer_duration: 30, timer_running: false,
        current_phase: 0, blueside: {}, redside: {}};
      handleControlAction("nextPhase");
    `, ctx);
    assert.equal(vm.runInContext("currentDraftData.timer", ctx), "30");
    assert.equal(vm.runInContext("currentDraftData.timer_running", ctx), true);
    await vm.runInContext('handleControlAction("stop")', ctx);
    await vm.runInContext('handleControlAction("start")', ctx);
    assert.equal(vm.runInContext("currentDraftData.timer", ctx), "30");
    await vm.runInContext('handleControlAction("reset")', ctx);
    assert.equal(vm.runInContext("currentDraftData.timer", ctx), "30");
    assert.equal(vm.runInContext("currentDraftData.timer_running", ctx), false);
  });
}
