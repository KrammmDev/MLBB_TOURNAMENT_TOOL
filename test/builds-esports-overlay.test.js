"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"../public");
const page=fs.readFileSync(path.join(root,"builds.html"),"utf8");
const css=fs.readFileSync(path.join(root,"builds.css"),"utf8");

test("OBS builds overlay keeps a transparent 1920x1080 compact equipment strip",()=>{
 assert.ok(css.includes("html, body {"));
 assert.ok(css.includes("width: 1920px;"));
 assert.ok(css.includes("height: 1080px;"));
 assert.ok(css.includes("background: transparent !important;"));
 assert.ok(css.includes(".mainbox {"));
 assert.ok(css.includes(".buildbox {"));
 assert.ok(css.includes("height: 325px;"));
 assert.ok(!css.includes("background-color: #f0f0f0"),"No opaque grey backdrop on OBS");
});

test("all ten player rows retain exactly six item targets and each hero ID",()=>{
 for(const [team,offset] of [["blue",0],["red",5]]){
  for(let i=1;i<=5;i++){
   const rowStart=page.indexOf('id="'+team+'side'+i+'"');
   assert.ok(rowStart>0,team+" player "+i);
   const nextRow=page.indexOf('<div class="player"',rowStart+1);
   const body=page.slice(rowStart,nextRow<0?rowStart+650:nextRow);
   const found=[...body.matchAll(/id="item([1-6])"/g)].map(x=>Number(x[1]));
   assert.equal(found.length,6,team+" P"+i);
   assert.deepEqual([...found].sort((a,b)=>a-b),[1,2,3,4,5,6]);
   if(team==="red")assert.deepEqual(found,[6,5,4,3,2,1],"Red preserves mirrored item order");
   else assert.deepEqual(found,[1,2,3,4,5,6]);
   assert.ok(page.includes('id="image-display-'+(i+offset)+'"'));
  }
 }
});
test("existing recognition and match renderer scripts stay loaded",()=>{
 assert.ok(page.includes('src="script/build.js"'));
 assert.ok(page.includes('src="script/build-recognition-bridge.js"'));
 assert.ok(css.includes("#blue-side .player"));
 assert.ok(css.includes("#red-side .player"));
 assert.ok(css.includes(".itembox {"));
 assert.ok(!page.includes('class="recognized-spell"'));
});

test("reference layout has 60 equipment slots, ten portraits, no gold and no spells",()=>{
 assert.ok(css.includes("width: 1008px;"),"reference panel width");
 assert.ok(css.includes("grid-template-columns: 400px 176px 400px;"));
 assert.ok(css.includes("background-size: contain;"));
 assert.ok(page.includes('<span>ITEM</span>'));
 assert.ok(page.includes('<span>BUILD</span>'));
 assert.ok(!page.includes('class="gold"'));
 assert.ok(!css.includes(".gold{"));
 assert.ok(!page.includes('battleSpell'));
 assert.ok(css.includes(".recognized-spell { display: none !important; }"));
});

test("blue left / red right equipment palette with neutral center",()=>{
 assert.ok(css.includes("--blue: #1289ff;"));
 assert.ok(css.includes("--red: #ff354e;"));
 assert.ok(css.includes("#blue-side .player {"));
 assert.ok(css.includes("rgba(8,42,82,.98)"));
 assert.ok(css.includes("#red-side .player {"));
 assert.ok(css.includes("rgba(99,18,37,.98)"));
 assert.ok(css.includes("#red-side .itembox {"));
 assert.ok(css.includes("#red-side .image-box { border-color: var(--red-edge); }"));
 assert.ok(css.includes("border-left: 2px solid var(--blue-edge);"));
 assert.ok(css.includes("border-right: 2px solid var(--red-edge);"));
});


test("esports finish keeps larger portraits, dark empty slots and clean visual framing",()=>{
 assert.ok(css.includes("--portrait: 60px;"));
 assert.ok(css.includes("--slot: 54px;"));
 assert.ok(css.includes("background-color: #111c2e;"));
 assert.ok(css.includes("background-color: #24121e;"));
 assert.ok(css.includes(".middle::before, .middle::after"));
 assert.ok(css.includes("padding-bottom: 30px;"));
 assert.ok(!css.includes("background-color: #f2f2f2;"));
});
