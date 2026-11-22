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
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id,{
        textContent:"", hidden:true,
        classList:{
          toggle(name, enabled) {
            if (enabled) classes.add(name);
            else classes.delete(name);
          },
          contains(name) { return classes.has(name); },
        },
      });
    }
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
  assert.equal(element("goldleadValue").textContent, "+2.5K");
  assert.equal(element("goldLead").hidden, false);
  assert.equal(element("goldLead").classList.contains("blue-lead"), true);
  assert.equal(element("ocr-timer").textContent,"10:20");
  assert.equal(element("ocr-blue-turtle").textContent,"2");
  assert.equal(element("ocr-red-turtle").textContent,"1");
  assert.deepEqual(turtleItems.map(x=>x.hidden),[false,false]);
  handler({type:"ocr_update",data:{...snapshot,fields:{...snapshot.fields,blueKills:{value:12,status:"stale"}}}});
  assert.equal(element("ocr-blue-kills").textContent,"12");
  handler({type:"ocr_update",data:{
    ...snapshot, fields:{...snapshot.fields,blueGold:{value:34000},redGold:{value:36700}},
  }});
  assert.equal(element("goldleadValue").textContent, "+2.7K");
  assert.equal(element("goldLead").classList.contains("red-lead"), true);
  handler({type:"ocr_update",data:{
    ...snapshot, fields:{...snapshot.fields,blueGold:{value:36700},redGold:{value:36700}},
  }});
  assert.equal(element("goldLead").hidden, true);
  handler({type:"ocr_update",data:{
    ...snapshot, fields:{...snapshot.fields,blueGold:{value:null}},
  }});
  assert.equal(element("goldLead").hidden, true);
  handler({type:"ocr_update",data:{...snapshot,showTurtles:false}});
  assert.deepEqual(turtleItems.map(x=>x.hidden),[true,true]);
  matchHandler({data:{...game,game_number:2}});
  assert.equal(element("ocr-blue-kills").textContent,"--");
  assert.equal(element("goldLead").hidden, true);
});

test("Studio OCR uses the confirmed objective PNG assets without affecting non-OCR scoreboard", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  for (const kind of ["gold", "tower", "lord", "turtle"]) {
    assert.ok(html.includes("/Assets/Other/" + kind + "1.png"));
    assert.ok(fs.existsSync(path.join(base, "Assets/Other", kind + "1.png")),
      "Expected asset is missing: " + kind + "1.png");
  }
  assert.ok(html.includes('id="goldLead"'));
  assert.ok(html.includes('id="goldleadValue"'));
  assert.match(css, /--blue-accent/);
  assert.match(css, /--red-accent/);
  assert.ok(css.includes('body.scoreboard-themed-ocr[data-scoreboard-theme="studio"] .sb-ocr-goldlead'));
});
test("Studio OCR hides KILLS wording and places team-colored Gold Lead inside the namebar gap", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  // The lead must follow the red team inside .midscorename, before its close.
  const leadMarkup = html.indexOf('<div id="goldLead"');
  const afterRedTeam = html.indexOf('            </div>\n              <div id="goldLead"', html.indexOf('id="name-box-8"'));
  assert.ok(leadMarkup >= 0);
  assert.equal(afterRedTeam, -1, "Gold Lead must not be nested in the 1920px outer lower container");
  assert.ok(html.includes('              </div>\n              <div id="goldLead"'),
    "Gold Lead must be a child of the positioned midscorename");
  const namebarStart = html.indexOf('class="midscorename"');
  const leadIndex = html.indexOf('id="goldLead"');
  const footerStart = html.indexOf('id="sb-production-strip"');
  assert.ok(namebarStart >= 0 && namebarStart < leadIndex && leadIndex < footerStart);
  assert.ok(!html.slice(html.indexOf('class="sb-ocr-clock"'),namebarStart)
    .includes('id="goldLead"'), "Gold Lead must not sit below the game timer");
  assert.ok(css.includes('.sb-ocr-goldlead.blue-lead'));
  assert.ok(css.includes('.sb-ocr-goldlead.red-lead'));
  assert.ok(css.includes('left: 176px;'));
  assert.ok(css.includes('right: 176px;'));


  assert.ok(!css.includes('content: "KILLS"'), "Do not add KILLS text by CSS");
  assert.match(css, /\.sb-ocr-stat:has\(\[id\$="-kills"\]\)\s+small\s*\{\s*display:\s*none;/,
    "Kill caption must remain hidden");

});
test("Studio OCR upper HUD preserves theme-driven gradients and color variables", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const prefix = 'body.scoreboard-themed-ocr[data-scoreboard-theme="studio"]';
  for (const selector of [".sb-ocr-side", ".sb-ocr-blue", ".sb-ocr-red", ".sb-ocr-clock"]) {
    assert.ok(css.includes(prefix + " " + selector), "Missing isolated Studio rule: " + selector);
  }
  assert.ok(css.includes("Brushed gunmetal"), "Expected satin metal texture");

  assert.ok(css.includes("var(--header-bg"), "Stats must follow theme background color");
  assert.ok(css.includes("var(--blue-accent"), "Blue kills must follow dynamic blue accent");
  assert.ok(css.includes("var(--red-accent"), "Red kills must follow dynamic red accent");
  assert.ok(css.includes("var(--gold-2"), "Timer must retain themed gold trim");
  assert.ok(!fs.readFileSync(path.join(base, "scoreboard.html"), "utf8")
    .includes("scoreboard-ocr-telemetry.css"), "Non-OCR scoreboard must remain untouched");
});
test("Studio OCR has an integrated two-tier HUD without changing Classic/Arena geometry", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const scoped = 'body.scoreboard-themed-ocr[data-scoreboard-theme="studio"]';
  assert.ok(css.includes(scoped + " .sb-ocr-hud"));
  assert.ok(css.includes(scoped + " .lower"));
  assert.ok(css.includes(scoped + " .sb-frame"));
  assert.ok(css.includes(scoped + " #sb-tournament-logo"));
  assert.ok(css.includes(scoped + " #sb-map-label { top: 155px; }"), "Studio OCR map artwork must align with original Studio");
  const baseStudio = fs.readFileSync(path.join(base, "themes/scoreboard-studio.css"), "utf8");
  assert.ok(baseStudio.includes('body[data-scoreboard-theme="studio"] #sb-map-label {\n  top: 155px;'), "Original Studio alignment must remain unchanged");
  assert.ok(css.includes('font-size: 43px;'), "kills should be visibly prominent");
  assert.ok(css.includes('font-size: 35px;'), "timer should have a prominent center placement");
  assert.match(css, /left: 510px;\s*width: 904px;\s*height: 74px;/);
  assert.match(css, /top: 78px;\s*height: 76px;/);
  assert.ok(css.includes('order: 5;'), "team metrics should reorder for integrated presentation");
  assert.ok(css.includes('.sb-ocr-turtle { order:'), "optional turtles stay inside HUD");
  assert.ok(html.includes('class="scoreboard-themed-ocr"'));
  assert.ok(!fs.readFileSync(path.join(base,"scoreboard.html"),"utf8")
    .includes("scoreboard-ocr-telemetry.css"), "non-OCR output must not import OCR redesign");
});

test("Studio OCR kills retain dark logo-holder styling without gold borders", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const tail = css.slice(css.indexOf("/* Studio OCR kill frames mirror the logo holders"));
  assert.ok(tail.includes('body.scoreboard-themed-ocr[data-scoreboard-theme="studio"]'));
  assert.ok(tail.includes('var(--header-bg'), "Kills should use the same dark theme background");
  assert.ok(tail.includes('var(--blue-accent'), "Blue glow should follow broadcast colors");
  assert.ok(tail.includes('var(--red-accent'), "Red glow should follow broadcast colors");
  assert.ok(tail.includes('inset: 0;'), "Inner background should fill panel without yellow outline");
  assert.ok(!tail.includes('background: linear-gradient(\\n    135deg,\\n    var(--gold-1'),
    "Kill panel should not use gold as its background frame");
  assert.ok(tail.includes('11px 100%, 0 calc(100% - 11px)'), "Red side should be mirrored");
  assert.ok(tail.includes('calc(100% - 11px) 100%, 0 100%'), "Blue side should cut bottom-right");
  assert.ok(!fs.readFileSync(path.join(base, "scoreboard.html"), "utf8")
    .includes("scoreboard-ocr-telemetry.css"), "Original scoreboard must be unchanged");
});

test("Classic OCR uses integrated gold-beveled stat rail with existing match geometry", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const scope = 'body.scoreboard-themed-ocr[data-scoreboard-theme="classic"]';
  assert.ok(css.includes(scope + " .sb-ocr-side"));
  assert.ok(css.includes(scope + " .sb-ocr-clock"));
  assert.ok(css.includes(scope + " .sb-ocr-goldlead"));
  assert.ok(css.includes("var(--edge, var(--sb-border, #e2ac39))"));
  assert.ok(css.includes('"Classic Display"'));
  assert.ok(css.includes("var(--blue-accent"));
  assert.ok(css.includes("var(--red-accent"));
  const classic = fs.readFileSync(path.join(base, "themes/scoreboard-classic.css"), "utf8");
  assert.ok(classic.includes(".sb-map-frame"), "Classic minimap frame remains in its own theme CSS");
  assert.ok(!fs.readFileSync(path.join(base,"scoreboard.html"),"utf8")
    .includes("scoreboard-ocr-telemetry.css"));
});

test("Arena OCR uses its own sharp segmented stats and scoreboard accent colors", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const scope = 'body.scoreboard-themed-ocr[data-scoreboard-theme="arena"]';
  assert.ok(css.includes(scope + " .sb-ocr-side"));
  assert.ok(css.includes(scope + " .sb-ocr-clock"));
  assert.ok(css.includes(scope + " .sb-ocr-goldlead"));
  assert.ok(css.includes("var(--sb-border, #28435b)"));
  assert.ok(css.includes("var(--sb-left, #1bc2d5)"));
  assert.ok(css.includes("var(--sb-right, #527fe8)"));
  const arena = fs.readFileSync(path.join(base, "themes/scoreboard-arena.css"), "utf8");
  assert.ok(arena.includes("bottom: 7px"), "Arena series rail remains in its original position");
});

test("Classic and Arena use PNG stats, mirrored kills, and safe Gold Lead namebar", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const shared = 'body.scoreboard-themed-ocr:is([data-scoreboard-theme="classic"], [data-scoreboard-theme="arena"])';
  assert.ok(css.includes(shared + " .sb-ocr-hud"));
  assert.ok(css.includes(shared + " .sb-ocr-icon"));
  assert.ok(css.includes(shared + " .sb-ocr-goldlead"));
  assert.ok(css.includes("left: 173px"));
  assert.ok(css.includes("right: 173px"));
  assert.ok(css.includes('order: 5;'));
  assert.ok(css.includes("minmax(0, 1fr) 112px minmax(0, 1fr)"));
  assert.ok(css.includes("background: transparent"), "Gold Lead needs no box background");
  for (const kind of ["gold", "tower", "lord", "turtle"]) {
    assert.ok(html.includes("/Assets/Other/" + kind + "1.png"));
  }
  for (const id of ["ocr-blue-kills", "ocr-red-kills", "ocr-blue-gold", "ocr-red-gold",
    "ocr-blue-tower", "ocr-red-tower", "ocr-timer", "goldLead"]) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
});

test("Classic and Arena OCR keep the original theme artwork geometry untouched", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const section = css.slice(css.indexOf("CLASSIC + ARENA OCR: integrated match rail"));
  const structural = [".sb-frame", ".sb-banner", ".sb-team-logo",
    ".teamnamesc", ".score-dots", ".sb-win", "#sb-tournament-logo",
    ".matchinfo-content", "#sb-sponsors", "#sb-map-label"];
  for (const selector of structural) {
    assert.ok(!section.includes(selector + " {"),
      "OCR layer must not reposition original Classic/Arena geometry: " + selector);
  }
  assert.ok(section.includes("left: 510px;"));
  assert.ok(section.includes("width: 905px;"));
  assert.ok(section.includes("height: 54px;"));
  const classic = fs.readFileSync(path.join(base, "themes/scoreboard-classic.css"), "utf8");
  const arena = fs.readFileSync(path.join(base, "themes/scoreboard-arena.css"), "utf8");
  assert.ok(classic.includes(".sb-map-frame"), "Keep Classic's minimap outline");
  assert.ok(classic.includes(".sb-frame"), "Keep Classic's angular frame");
  assert.ok(arena.includes(".sb-banner-right"), "Keep Arena's mirrored logo holder");
  assert.ok(arena.includes("bottom: 7px"), "Keep Arena's original scoreline");
});

test("Classic and Arena Gold Lead have separate theme-specific visuals", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const classic = css.slice(css.indexOf("/* Classic: restrained bevel inset"),
    css.indexOf("/* ARENA OCR"));
  const arena = css.slice(css.indexOf("/* Arena: narrow tactical tag"));
  assert.ok(classic.includes('border-bottom: 2px solid var(--edge'));
  assert.ok(classic.includes('"Classic Display"'));
  assert.ok(classic.includes("clip-path: polygon(5px 0"));
  assert.ok(arena.includes('border-left: 3px solid var(--blue-accent'));
  assert.ok(arena.includes('border-right: 3px solid var(--red-accent'));
  assert.ok(arena.includes("clip-path: polygon(0 0"));
  assert.ok(css.includes(".sb-ocr-goldlead[hidden]"), "Unknown/tied gold must remain hidden");
  assert.ok(css.includes(".sb-ocr-goldlead.blue-lead"));
  assert.ok(css.includes(".sb-ocr-goldlead.red-lead"));
});

test("M Worlds and EWC OCR variants use different reference palette treatments", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const reference = css.slice(css.indexOf("Broadcast-reference styling for OCR variants only"));
  assert.ok(reference.includes('data-scoreboard-theme="classic"] .sb-ocr-clock'));
  assert.ok(reference.includes('data-scoreboard-theme="arena"] .sb-ocr-clock'));
  assert.ok(reference.includes('color-mix(in srgb, var(--header-bg, #545454) 52%, #a5a5a5)'),
    "M Worlds should use silver/graphite clock");
  assert.ok(reference.includes("linear-gradient(180deg, #ffffff 0%, #f3f3f2 42%, #d9dadd 100%)"),
    "EWC should use bright silver stat rail");
  assert.ok(reference.includes("filter: brightness(0) opacity(.83)"),
    "EWC white stat rail needs dark objective icons");
  assert.ok(reference.includes('data-scoreboard-theme="classic"] .sb-ocr-goldlead'));
  assert.ok(reference.includes('data-scoreboard-theme="arena"] .sb-ocr-goldlead'));
  assert.ok(reference.includes('border-bottom: 3px solid var(--blue-accent'));
  assert.ok(reference.includes('border-bottom: 3px solid var(--red-accent'));
  assert.ok(!fs.readFileSync(path.join(base, "scoreboard.html"), "utf8")
    .includes("scoreboard-ocr-telemetry.css"), "Original non-OCR output unchanged");
});

test("M Worlds and MSC/EWC OCR references use distinct compositions without event palette", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const section = css.slice(css.indexOf("OCR COMPOSITION — STRUCTURE, NOT EVENT COLORS"));
  const classic = section.slice(0, section.indexOf("/* MSC/EWC: stats"));
  const arena = section.slice(section.indexOf("/* MSC/EWC: stats"));
  assert.ok(classic.includes("grid-template-columns: minmax(0, 1fr) 106px minmax(0, 1fr)"));
  assert.ok(classic.includes('data-scoreboard-theme="classic"] .sb-ocr-clock'));
  assert.ok(classic.includes("height: 54px"), "Classic keeps kills near centered crest");
  assert.ok(arena.includes('data-scoreboard-theme="arena"] .sb-ocr-side .sb-ocr-stat:has([id$="-kills"])'));
  assert.ok(arena.includes("top: 48px"), "Arena kills belong in the team-name band");
  assert.ok(arena.includes("top: 115px"), "Arena clock sits below its center tournament logo");
  assert.ok(arena.includes("height: 25px"), "Arena lower clock should be compact");
  assert.ok(arena.includes('grid-column: 3'), "Red side must stay in its own stats lane");
  assert.ok(arena.includes("padding-left: 70px"), "Right name stays clear of central kill score");
  assert.ok(section.includes("var(--blue-accent"), "Team colors remain customizable");
  assert.ok(section.includes("var(--red-accent"), "Team colors remain customizable");
  assert.ok(section.includes("var(--edge"), "Trim colors remain customizable");
  assert.ok(!section.includes("#870c32"), "No event-brand palette copied");
  const studio = css.slice(0, css.indexOf("CLASSIC + ARENA OCR: integrated match rail"));
  assert.ok(studio.includes("Studio OCR kill frames mirror the logo holders"));
  const standard = fs.readFileSync(path.join(base, "scoreboard.html"), "utf8");
  assert.ok(!standard.includes("scoreboard-ocr-telemetry.css"));
});

test("Arena reference has a central trapezoid and separately positioned tournament crest and clock", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const tail = css.slice(css.indexOf("Arena screenshot refinement: MSC/EWC-style center shield architecture"));
  assert.ok(tail.includes('.sb-ocr-hud::before'), "Outer trapezoid");
  assert.ok(tail.includes('.sb-ocr-hud::after'), "Inset trapezoid");
  assert.ok(tail.includes('clip-path: polygon(22% 0, 78% 0, 100% 100%, 0 100%)'));
  assert.ok(tail.includes('top: 110px'), "Timer below center crest");
  assert.ok(tail.includes('top: 43px'), "Existing center logo remains visible");
  assert.ok(tail.includes('var(--header-bg'), "Saved palette drives center shield");
  assert.ok(tail.includes('var(--edge'), "Saved trim drives center shield");
  assert.ok(!tail.includes('content: "MSC"'), "Never hardcode reference tournament branding");
});

test("Classic and Arena OCR V2 use distinct 1920px geometry instead of stacked overlays", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-telemetry.css"), "utf8");
  const v2 = css.slice(css.indexOf("REFERENCE GEOMETRY V2"));
  const classic = v2.slice(0, v2.indexOf("/* ARENA MSC/EWC"));
  const arena = v2.slice(v2.indexOf("/* ARENA MSC/EWC"));
  assert.match(classic, /\.sb-frame \{[\s\S]*?left: 394px;[\s\S]*?width: 1136px;[\s\S]*?height: 135px;/);
  assert.ok(classic.includes("height: 79px;"), "Classic nameplate depth is increased");
  assert.ok(classic.includes("font-size: 38px;"), "Classic large kills stay beside crest");
  assert.ok(classic.includes("top: 65px;"), "Classic central tournament logo occupies lower tier");
  assert.ok(arena.includes("grid-template-columns: minmax(0,1fr) 258px minmax(0,1fr)"),
    "Arena reserves a dedicated shield column rather than overlapping other stats");
  assert.ok(arena.includes("top: 43px;"), "Arena kill panels start in second tier");
  assert.ok(arena.includes("height: 71px;"), "Arena kills fill the middle band");
  assert.ok(arena.includes("padding: 0 130px 0 16px;"), "Arena team names reserve space");
  assert.ok(arena.includes("padding: 0 16px 0 130px;"), "Red name has mirrored spacing");
  assert.ok(arena.includes("top: 110px;"), "Arena timer hangs beneath crest");
  assert.ok(arena.includes("clip-path: polygon(20% 0,80% 0,100% 100%,0 100%)"),
    "Arena shield is genuinely trapezoidal");
  assert.ok(arena.includes("var(--header-bg"), "Arena remains palette driven");
  assert.ok(arena.includes("var(--edge"), "Arena edge remains palette driven");
  assert.ok(!fs.readFileSync(path.join(base, "scoreboard.html"), "utf8")
    .includes("scoreboard-ocr-telemetry.css"), "Non-OCR stays unchanged");
});
