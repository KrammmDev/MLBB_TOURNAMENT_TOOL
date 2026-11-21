"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const M = require("../public/script/ocr-model");
const base = path.join(__dirname, "../public");
const html = fs.readFileSync(path.join(base, "scoreboard-themed-ocr.html"), "utf8");
const script = fs.readFileSync(path.join(base, "script/scoreboard-themed-ocr-client.js"), "utf8");

test("Broadcast Themes offers the three-theme OCR scoreboard preview and separate OBS URL", () => {
  const controls = fs.readFileSync(path.join(base, "script/roster-theme-control.js"), "utf8");
  const themePage = fs.readFileSync(path.join(base, "broadcast-themes.html"), "utf8");
  assert.match(themePage, /<option value="scoreboard-ocr">In-game scoreboard · OCR<\/option>/);
  assert.ok(controls.includes('outputSelect.value === "scoreboard-ocr"'));
  assert.ok(controls.includes('"/scoreboard-themed-ocr.html"'));
  assert.ok(controls.includes('"/scoreboard.html"'));
  assert.ok(themePage.includes('id="theme-preview"'));
});
test("themed OCR output uses original scoreboard renderer and all three theme styles", () => {
  for (const p of [
    "themes/scoreboard-base.css", "script/scoreboard-renderer.js",
    "script/ocr-model.js", "script/scoreboard-themed-ocr-client.js",
    "themes/scoreboard-ocr-telemetry.css",
  ]) assert.ok(html.includes(p), p);
  for (const id of [
    "displayImage1", "displayImage2", "name-box-1", "name-box-8",
    "blue-score-display", "red-score-display", "sb-sponsors",
    "ocr-blue-kills", "ocr-red-kills", "ocr-blue-gold", "ocr-red-gold",
    "ocr-blue-tower", "ocr-red-tower", "ocr-timer",
  ]) assert.ok(html.includes('id="' + id + '"'), id);
  const themes = require("../public/script/roster-themes");
  assert.deepEqual(themes.themes.map(t => t.id), ["classic","arena","studio"]);
  assert.ok(themes.themes.every(t => t.scoreboardStyles.length));
});

test("themed OCR client displays accepted stats, held reads, turtles and safely blanks on game change", async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{ textContent:"", hidden:true });
    return elements.get(id);
  };
  const turtleItems = [{hidden:true},{hidden:true}];
  let handler, matchHandler;
  const game = { game_number:1, matchInfo:{ match:"Final",game:"GAME 1" },
    teamdata:{ blueteam:{teamname:"Blue",turtles:2},redteam:{teamname:"Red",turtles:1} } };
  const snapshot = { source:"custom", active:true, preview:false, showTurtles:true,
    context:M.context(game), generation:"session", fields:{
      blueKills:{value:12},redKills:{value:9},
      blueGold:{value:36700},redGold:{value:34200},timer:{value:620},
      blueTower:{value:3},redTower:{value:2},
      blueLord:{value:null},redLord:{value:null},
    }};
  const window = {
    OCRModel:M,
    MatchDataClient:{subscribe(onData,_status,options){
      matchHandler=onData;
      handler=options.onMessage;
      onData({data:game});
      return ()=>{};
    }},
    addEventListener() {},
  };
  const sandbox = {
    window, document:{
      documentElement:{dataset:{}},
      getElementById:element,
      querySelectorAll:()=>turtleItems,
    },
    location:{search:"?ocr=custom"},
    URLSearchParams, Date,
    setInterval:()=>1, clearInterval:()=>{},
    fetch:async()=>({ok:true,json:async()=>snapshot}),
    AbortSignal:{timeout:()=>null},
  };
  vm.runInNewContext(script,sandbox);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(element("ocr-blue-gold").textContent,"36.7K");
  assert.equal(element("ocr-red-kills").textContent,"9");
  assert.equal(element("ocr-timer").textContent,"10:20");
  assert.equal(element("ocr-blue-turtle").textContent,"2");
  assert.equal(element("ocr-red-turtle").textContent,"1");
  assert.deepEqual(turtleItems.map(x=>x.hidden),[false,false]);
  handler({type:"ocr_update",data:{...snapshot,fields:{...snapshot.fields,blueKills:{value:12,status:"stale"}}}});
  assert.equal(element("ocr-blue-kills").textContent,"12");
  handler({type:"ocr_update",data:{...snapshot,showTurtles:false}});
  assert.deepEqual(turtleItems.map(x=>x.hidden),[true,true]);
  matchHandler({data:{...game,game_number:2}});
  assert.equal(element("ocr-blue-kills").textContent,"--");
});
