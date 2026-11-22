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
  const leftName = {append(node) { node.parentElement = this; }};
  const rightName = {append(node) { node.parentElement = this; }};
  const namebar = {append(node) { node.parentElement = this; }};
  element("goldLead").parentElement = namebar;
  const doc = {
    body:{dataset:{scoreboardTheme:"classic"}},
    documentElement:{dataset:{}},
    getElementById:element,
    querySelectorAll:()=>turtleItems,
    querySelector(selector) {
      return selector === ".midscorename" ? namebar
        : selector === ".teamnamesc.sb-left .tn" ? leftName
        : selector === ".teamnamesc.sb-right .tn" ? rightName
        : null;
    },
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
    window, document:doc,
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
  assert.equal(element("goldLead").parentElement, leftName, "Blue lead sits beneath Blue name");
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
  assert.equal(element("goldLead").parentElement, rightName, "Red lead sits beneath Red name");
  handler({type:"ocr_update",data:{
    ...snapshot, fields:{...snapshot.fields,blueGold:{value:36700},redGold:{value:36700}},
  }});
  assert.equal(element("goldLead").hidden, true);
  assert.equal(element("goldLead").parentElement, namebar, "Hidden lead leaves the team name lane");
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

test("Classic and Arena have visibly distinct HUD silhouette rules", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-esports.css"), "utf8");
  const v3 = css.slice(css.indexOf("THEME SEPARATION V3"));
  const classic = v3.slice(v3.indexOf("/* Classic ="), v3.indexOf("/* Arena ="));
  const arena = v3.slice(v3.indexOf("/* Arena ="));
  assert.ok(classic.includes('height: 138px;'), "Classic frame has deep angular edges");
  assert.ok(classic.includes('font-size: 35px;'), "Classic condensed team names");
  assert.ok(classic.includes('height: 30px;'), "Classic uses tall win strokes");
  assert.ok(arena.includes('height: 124px;'), "Arena has a shorter tactical frame");
  assert.ok(arena.includes('height: 38px;'), "Arena stats are more compact");
  assert.ok(arena.includes('font-size: 47px;'), "Arena kill plates are larger");
  assert.ok(arena.includes('width: 23px;'), "Arena uses short horizontal win pips");
  assert.ok(v3.includes('background: transparent;'), "Lead has no background");
  assert.ok(v3.includes('border: 0;'), "Lead has no border");
});

test("Classic series scoreline uses left backslash and right slash, not reversed", () => {
  const css = fs.readFileSync(path.join(base, "themes/scoreboard-ocr-esports.css"), "utf8");
  const v7 = css.slice(css.indexOf("CLASSIC OCR V7 — SAVED PALETTE + MIRRORED SCORELINES"));
  const left = v7.match(/\.sb-left \.sb-win \{([^}]*)\}/);
  const right = v7.match(/\.sb-right \.sb-win \{([^}]*)\}/);
  assert.ok(left && right, "Both Classic series marker rules exist");
  assert.match(left[1], /transform:\s*skewX\(15deg\)/);
  assert.match(right[1], /transform:\s*skewX\(-15deg\)/);
  assert.ok(v7.includes('background: var(--classic-left);'));
  assert.ok(v7.includes('background: var(--classic-right);'));
});


/* Current OCR layout contracts replace brittle assertions from retired design
   snapshots. Browser tests remain responsible for actual geometry. */
test("Gold Lead is directly under the namebar regardless of HTML formatting", () => {
  const start=html.indexOf('<div class="midscorename">');
  const lead=html.indexOf('<div id="goldLead"');
  const footer=html.indexOf('<div id="sb-production-strip"');
  assert.ok(start>=0&&lead>start&&footer>lead);
  const tags=html.slice(start,lead).match(/<[/]?div\\b[^>]*>/g)||[];
  assert.equal(tags.reduce((n,t)=>n+(t.startsWith("</")?-1:1),0),1);
});
test("Gold Lead attaches to Classic winner and hides on tied or unavailable gold", () => {
  assert.ok(script.includes('const namedLead = theme === "classic";'));
  assert.ok(script.includes("destination.append(lead)"));
  assert.ok(script.includes("lead.hidden = !known || difference === 0"));
  assert.ok(script.includes('".teamnamesc.sb-left .tn"'));
  assert.ok(script.includes('".teamnamesc.sb-right .tn"'));
});
const ocrCurrentStyles=Object.freeze({
  telemetry:fs.readFileSync(path.join(base,"themes/scoreboard-ocr-telemetry.css"),"utf8"),
  esports:fs.readFileSync(path.join(base,"themes/scoreboard-ocr-esports.css"),"utf8")
});
for(const [name,style,required] of [["Studio scoped HUD and map","telemetry",["data-scoreboard-theme=\"studio\"] .sb-ocr-hud","data-scoreboard-theme=\"studio\"] #sb-map-label","data-scoreboard-theme=\"studio\"] .lower"]],["Studio kills use configured colors and dark panels","telemetry",["Studio OCR kill frames mirror","var(--header-bg","var(--blue-accent","var(--red-accent"]],["Classic and Arena telemetry is isolated","telemetry",["CLASSIC + ARENA OCR: integrated match rail","data-scoreboard-theme=\"classic\"","data-scoreboard-theme=\"arena\""]],["Composition remains theme-variable driven","telemetry",["OCR COMPOSITION — STRUCTURE, NOT EVENT COLORS","var(--blue-accent","var(--red-accent"]],["Studio Gold Lead has independent team colors","telemetry",[".sb-ocr-goldlead.blue-lead",".sb-ocr-goldlead.red-lead"]],["Esports layout selectors are OCR-only","esports",["body.scoreboard-themed-ocr:is(","data-scoreboard-theme=\"classic\"","data-scoreboard-theme=\"arena\"",".sb-ocr-hud"]],["Arena contrast uses saved team colors","esports",["--arena-panel:","--arena-upper:","--arena-text: #f6f9fd","var(--es-blue)","var(--es-red)"]],["Arena lead uses the real gold PNG","esports",["V5 — ARENA FLOATING GOLD LEAD","/Assets/Other/gold1.png"]],["Classic grid reserves separate blue center red tracks","esports",["CLASSIC OCR V6 — FIX REAL GRID COLLISION","grid-column: 1;","grid-column: 2;","grid-column: 3;","justify-self: center;"]],["Classic logo and text polish is retained","esports",["CLASSIC OCR — FINAL BROADCAST POLISH","font-variant-numeric: tabular-nums;","text-overflow: ellipsis;","object-fit: contain;"]],["Classic colors come from saved palette","esports",["--classic-panel: var(--es-surface);","--classic-ink: var(--es-ink);","--classic-trim: var(--es-edge);","--classic-left: var(--es-blue);","--classic-right: var(--es-red);"]],["Arena connector keeps minimap gap noninteractive","esports",["ARENA OCR — MINIMAP / LEFT LOGO CONNECTOR","data-scoreboard-theme=\"arena\"] .scoreboard::before","width: 52.08px;","pointer-events: none;"]],["Arena logo paints over connector","esports",["ARENA OCR — MINIMAP / LEFT LOGO CONNECTOR","z-index: 0;","z-index: 4;",".sb-team-logo","img {"]],["Classic scoreline uses distinct team accents","esports",["CLASSIC OCR — BOTH TEAM SCORELINES","background: var(--classic-left);","background: var(--classic-right);"]]]) {
  test(name, () => {
    for(const token of required)
      assert.ok(ocrCurrentStyles[style].includes(token),name+": missing "+token);
    const standard=fs.readFileSync(path.join(base,"scoreboard.html"),"utf8");
    assert.ok(!standard.includes("scoreboard-ocr-esports.css"));
    assert.ok(!standard.includes("scoreboard-ocr-telemetry.css"));
  });
}
