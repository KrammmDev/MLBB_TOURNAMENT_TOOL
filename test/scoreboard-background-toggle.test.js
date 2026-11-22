"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createScoreboardBackgroundStore, defaults, valid} = require("../lib/scoreboard-background");
const base = path.join(__dirname, "../public");
const read = p => fs.readFileSync(path.join(base,p),"utf8");

test("Standard scoreboard backgrounds default ON independently for Classic, Arena and Studio", () => {
  assert.deepEqual(defaults().backgrounds,{classic:true,arena:true,studio:true});
  assert.equal(valid(defaults()),true);
});
test("Standard scoreboard settings persist per theme and reject stale saves", async () => {
  const saved = [];
  const store = createScoreboardBackgroundStore({initial:defaults(),file:"unused.json",
    persist: async (_file,data) => saved.push(JSON.parse(data))});
  const first = store.snapshot();
  const after = await store.save("classic",false,first.revision);
  assert.deepEqual(after.data.backgrounds,{classic:false,arena:true,studio:true});
  assert.equal(saved.length,1);
  assert.notEqual(after.revision,first.revision);
  await assert.rejects(store.save("arena",false,first.revision),{status:409});
  const next = await store.save("arena",false,after.revision);
  assert.deepEqual(next.data.backgrounds,{classic:false,arena:false,studio:true});
  await assert.rejects(store.save("invalid",false,next.revision),{status:400});
  await assert.rejects(store.save("studio","false",next.revision),{status:400});
});
test("Standard scoreboard toggle only appears for scoreboard, not OCR or other outputs", () => {
  const html = read("broadcast-themes.html");
  const control = read("script/scoreboard-background-control.js");
  const ocrControl = read("script/ocr-background-control.js");
  const api = fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
  assert.ok(html.includes('id="scoreboard-background-controls"'));
  assert.ok(html.includes('id="scoreboard-background-enabled"'));
  assert.ok(html.includes('/script/scoreboard-background-control.js'));
  assert.ok(control.includes('output.value === "scoreboard"'));
  assert.ok(ocrControl.includes('output.value === "scoreboard-ocr"'));
  assert.ok(control.includes('"/api/scoreboard-background"'));
  assert.ok(control.includes('"If-Match":revision'));
  assert.ok(api.includes("installScoreboardBackgroundRoutes(app, () => scoreboardBackgroundStore)"));
  assert.ok(api.includes('runtime", "scoreboard-background.json'));
  assert.ok(api.includes('type: "scoreboard_background_update"'));
});
test("Regular scoreboard uses its own OFF styles, leaves OCR separate and sponsor logos visible", () => {
  const html = read("scoreboard.html");
  const ocrHtml = read("scoreboard-themed-ocr.html");
  const css = read("themes/scoreboard-background.css");
  const js = read("script/scoreboard-background-client.js");
  assert.ok(html.includes("/themes/scoreboard-background.css"));
  assert.ok(html.includes("/script/scoreboard-background-client.js"));
  assert.ok(!ocrHtml.includes("/themes/scoreboard-background.css"));
  assert.ok(!ocrHtml.includes("/script/scoreboard-background-client.js"));
  assert.ok(ocrHtml.includes("/themes/scoreboard-ocr-background.css"));
  assert.ok(css.includes('body[data-standard-background="off"] .sb-frame'));
  assert.ok(css.includes('body[data-standard-background="off"] .match-info'));
  assert.ok(css.includes('body[data-standard-background="off"] #sb-sponsors'));
  assert.ok(css.includes('body[data-standard-background="off"] .teamnamesc::before'));
  assert.ok(!css.includes("visibility: hidden !important"),"Sponsor logo must remain visible");
  assert.ok(!css.includes("display: none !important"),"All match information remains in DOM");
  assert.ok(!css.includes(".sb-win {"),"Series score wins remain visible");
  assert.ok(js.includes('dataset.standardBackground'));
  assert.ok(js.includes('"/api/scoreboard-background"'));
  assert.ok(js.includes('setInterval('));
  assert.ok(css.includes('-webkit-background-clip: border-box !important;'),"Studio text keeps its fill");
});
