"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {createOCRBackgroundStore, defaults, valid} = require("../lib/ocr-background");
const dir = path.join(__dirname, "../public");
const read = relative => fs.readFileSync(path.join(dir, relative), "utf8");

test("OCR background defaults to ON independently for all three themes", () => {
  assert.deepEqual(defaults().backgrounds, {classic:true,arena:true,studio:true});
  assert.equal(valid(defaults()),true);
});
test("OCR background saves one theme and preserves other themes", async () => {
  const writes = [];
  const store = createOCRBackgroundStore({
    initial:defaults(),file:"unused.json",
    persist:async (_file,content) => {writes.push(JSON.parse(content));},
  });
  const initial = store.snapshot();
  const next = await store.save("arena",false,initial.revision);
  assert.deepEqual(next.data.backgrounds,{classic:true,arena:false,studio:true});
  assert.equal(writes.length,1);
  assert.notEqual(next.revision,initial.revision);
  const third = await store.save("studio",false,next.revision);
  assert.deepEqual(third.data.backgrounds,{classic:true,arena:false,studio:false});
  await assert.rejects(store.save("classic",false,initial.revision),{status:409});
  await assert.rejects(store.save("nonsense",false,third.revision),{status:400});
  await assert.rejects(store.save("classic","false",third.revision),{status:400});
});
test("OCR background server/API, toggles, stylesheet, and live OBS scripts are isolated", () => {
  const server = fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
  const panel = read("broadcast-themes.html");
  const control = read("script/ocr-background-control.js");
  const page = read("scoreboard-themed-ocr.html");
  const client = read("script/scoreboard-ocr-background-client.js");
  const css = read("themes/scoreboard-ocr-background.css");
  const normal = read("scoreboard.html");
  assert.ok(server.includes('installOCRBackgroundRoutes(app, () => ocrBackgroundStore)'));
  assert.ok(server.includes('runtime", "ocr-background.json'));
  assert.ok(panel.includes('id="ocr-background-controls"'));
  assert.ok(panel.includes('id="ocr-background-enabled"'));
  assert.ok(control.includes('output.value === "scoreboard-ocr"'));
  assert.ok(control.includes('method: "PUT"'));
  assert.ok(control.includes('"If-Match":revision'));
  assert.ok(page.includes('/themes/scoreboard-ocr-background.css'));
  assert.ok(page.includes('/script/scoreboard-ocr-background-client.js'));
  assert.ok(client.includes('dataset.ocrBackground'));
  assert.ok(client.includes('cache: "no-store"'));
  assert.ok(client.includes('setInterval('));
  assert.ok(css.includes('[data-ocr-background="off"] .sb-frame'));
  assert.ok(css.includes('[data-ocr-background="off"] .sb-ocr-clock'));
  assert.ok(css.includes('[data-ocr-background="off"] .sb-ocr-stat strong'));
  assert.ok(css.includes('background: transparent !important'));
  assert.ok(!css.includes('display: none !important'),"Never remove live OCR content boxes");
  assert.ok(!normal.includes('scoreboard-ocr-background.css'));
  assert.ok(!normal.includes('scoreboard-ocr-background-client.js'));
});

test("Background OFF leaves readable right-side text but hides match-info graphics", () => {
  const css = read("themes/scoreboard-ocr-background.css");
  for (const selector of [
    ".matchinfo-content", "#match-display", "#sb-sponsors",
    "#sb-production-strip", "#sb-patch-label", "#sb-caster-cell",
  ]) {
    assert.ok(css.includes('[data-ocr-background="off"] ' + selector),
      selector + " must lose its panel background in OFF mode");
  }
  assert.ok(css.includes(".match-info #sb-sponsors > *"));
  assert.ok(css.includes("visibility: hidden !important;"), "Sponsor logo must be hidden in text-only mode");
  assert.ok(css.includes('background-clip: border-box !important;'),
    "Studio gradient title must stop using transparent background-clipped text");
  assert.ok(css.includes('-webkit-text-fill-color: var(--sb-readable'),
    "Stage title, day and match text stay visible");
  assert.ok(css.includes('[data-ocr-background="off"] .sb-frame'));
  assert.ok(!css.includes('display: none !important'), "Keep the text/layout boxes");
  const studio = read("themes/scoreboard-studio.css");
  assert.ok(studio.includes("#matchinfo-main"));
  assert.ok(studio.includes("#match-display"));
});
