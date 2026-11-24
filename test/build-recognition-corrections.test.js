"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const express=require("express");
const {installBuildRecognitionRoutes}=require("../lib/build-recognition-routes");
const png=Buffer.from("89504e470d0a1a0a","hex");
test("manual item/spell corrections modify the scan draft before Apply",async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"mlbb-correction-"));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,"public/database"),{recursive:true});
 await fs.writeFile(path.join(root,"public/database/mlbb-ingame-item-spell-slot-map.json"),"{}");
 await fs.writeFile(path.join(root,"public/database/item-mappings.json"),JSON.stringify({
  "014":{name:"Boots",image:"/Assets/Itemandspell/Boots.png",type:"item"}
 }));
 await fs.writeFile(path.join(root,"public/database/spell-mappings.json"),JSON.stringify({
  "SP010":{name:"Flicker",image:"/Assets/Itemandspell/Flicker.png",type:"spell"}
 }));
 const app=express();
 const createDraft=()=>({
  teams:{blue:[{player_index:1,items:[{slot:1,status:"uncertain",confidence:.72}],
   battleSpell:{status:"uncertain",confidence:.72}}],red:[]},
  counts:{matched:0,empty:0,uncertain:2,missing_references:0}
 });
 installBuildRecognitionRoutes(app,{root,detectScan:async()=>createDraft(),
  loadLibrary:async()=>({items:[{}],spells:[{}],missingItems:0,missingSpells:0})});
 const srv=app.listen(0,"127.0.0.1");
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 await new Promise(resolve=>srv.once("listening",resolve));
 const base="http://127.0.0.1:"+srv.address().port;
 const request=async(uri,body)=>{
  const resp=await fetch(base+uri,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  return {status:resp.status,data:await resp.json()};
 };
 const scan=async()=>{
  const resp=await fetch(base+"/api/build-recognition/scan",{method:"POST",headers:{"Content-Type":"image/png"},body:png});
  assert.equal(resp.status,200);return resp.json();
 };
 const initial=await scan();
 assert.ok(initial.scanId);
 const item={scanId:initial.scanId,team:"blue",playerIndex:1,kind:"item",slot:1,assetId:"014"};
 let result=await request("/api/build-recognition/correct",item);
 assert.equal(result.status,200);
 assert.equal(result.data.teams.blue[0].items[0].name,"Boots");
 assert.equal(result.data.teams.blue[0].items[0].method,"manual");
 assert.equal(result.data.counts.uncertain,1);
 result=await request("/api/build-recognition/correct",{...item,kind:"spell",assetId:"SP010"});
 assert.equal(result.status,200);
 assert.equal(result.data.teams.blue[0].battleSpell.name,"Flicker");
 assert.equal(result.data.counts.matched,2);
 const applied=await request("/api/build-recognition/apply",{});
 assert.equal(applied.status,200);
 const state=await (await fetch(base+"/api/build-recognition/state")).json();
 assert.equal(state.teams.blue[0].items[0].name,"Boots");
 assert.equal(state.teams.blue[0].battleSpell.name,"Flicker");
 result=await request("/api/build-recognition/correct",{...item,assetId:"does-not-exist"});
 assert.equal(result.status,400);
 result=await request("/api/build-recognition/correct",{...item,slot:7});
 assert.equal(result.status,400);
 result=await request("/api/build-recognition/correct",{...item,assetId:"idle"});
 assert.equal(result.status,200);
 assert.equal(result.data.teams.blue[0].items[0].status,"empty");
 assert.equal(result.data.counts.empty,1);
 const newer=await scan();
 assert.notEqual(newer.scanId,initial.scanId);
 result=await request("/api/build-recognition/correct",item);
 assert.equal(result.status,409);
 result=await request("/api/build-recognition/correct",{...item,scanId:newer.scanId,kind:"spell",assetId:"idle"});
 assert.equal(result.status,400);
});
