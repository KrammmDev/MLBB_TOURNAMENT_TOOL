"use strict";
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const express=require('express');
const {loadReferenceLibrary,detect}=require('./build-recognizer');
function local(req){
 const ip=req.socket.remoteAddress||'';
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))return false;
 const origin=req.get('origin');if(!origin)return true;
 try{const u=new URL(origin);return (u.hostname==='localhost'||u.hostname==='127.0.0.1')&&u.host===req.get('host')}catch{return false}
}
function installBuildRecognitionRoutes(app,options={}){
 const scanImage=options.detectScan||detect;
 const references=options.loadLibrary||loadReferenceLibrary;
 const root=options.root||path.resolve(__dirname,'..'),pub=path.join(root,'public');
 const mapPath=path.join(pub,'database','mlbb-ingame-item-spell-slot-map.json');
 const file=path.join(root,'runtime','build-recognition-state.json');
 let state={active:false,teams:null,updatedAt:null},draft=null;
 try{const loaded=JSON.parse(fs.readFileSync(file,'utf8'));if(typeof loaded.active==='boolean')state=loaded}catch{}
 const onlyLocal=(req,res,next)=>local(req)?next():res.status(403).json({error:'Localhost only'});
 app.get('/api/build-recognition/state',(req,res)=>res.set('Cache-Control','no-store').json(state));
 app.get('/api/build-recognition/status',onlyLocal,async(req,res)=>{try{const lib=await references(pub);res.set('Cache-Control','no-store').json({items:lib.items.length,spells:lib.spells.length,missingItems:lib.missingItems,missingSpells:lib.missingSpells,active:state.active})}catch(e){res.status(500).json({error:e.message})}});
 app.post('/api/build-recognition/scan',onlyLocal,express.raw({type:'image/png',limit:'12mb'}),async(req,res)=>{
  try{
   if(!Buffer.isBuffer(req.body)||req.body.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return res.status(400).json({error:'Upload a PNG image'});
   // The slot map is only needed for scans. Startup fixtures intentionally omit it.
   let map;
   try{map=JSON.parse(fs.readFileSync(mapPath,'utf8'));}
   catch(e){return res.status(503).json({error:e.code==='ENOENT'?'Equipment slot map is missing. Restore public/database/mlbb-ingame-item-spell-slot-map.json.':'Equipment slot map is invalid. Check its JSON format.'});}
   const lib=await loadReferenceLibrary(pub);
   draft=await scanImage(req.body,map,lib);
   draft.scanId=randomUUID();
   res.json({...draft,referenceCount:{items:lib.items.length,spells:lib.spells.length},message:lib.items.length?'Review detections before Apply.':'No matching reference PNG files. Check /public/Assets/Itemandspell.'});
  }catch(e){res.status(400).json({error:e.message})}
 });
 // Manual corrections are applied to the server's current scan draft, never to
 // matchdatateam.json. The scan ID prevents stale picker selections.
 app.post('/api/build-recognition/correct',onlyLocal,express.json({limit:'8kb'}),(req,res)=>{
  const b=req.body||{};
  if(!draft||typeof b.scanId!=='string'||b.scanId!==draft.scanId)
   return res.status(409).json({error:'Scan changed. Review the latest results before correcting.'});
  if(!['blue','red'].includes(b.team)||!Number.isInteger(b.playerIndex)||b.playerIndex<1||b.playerIndex>5||
     !['item','spell'].includes(b.kind)||!Number.isInteger(b.slot)||b.slot<1||
     (b.kind==='item'&&b.slot>6)||(b.kind==='spell'&&b.slot!==1)||
     typeof b.assetId!=='string'||b.assetId.length>16)
   return res.status(400).json({error:'Invalid correction target or asset.'});
  const player=(draft.teams[b.team]||[]).find(p=>p.player_index===b.playerIndex);
  if(!player)return res.status(400).json({error:'Player does not exist in scan.'});
  const target=b.kind==='spell'?player.battleSpell:(player.items||[]).find(s=>s.slot===b.slot);
  if(!target)return res.status(400).json({error:'Slot does not exist in scan.'});
  if(target.status!=='uncertain'&&target.method!=='manual')
   return res.status(409).json({error:'Only uncertain or manually corrected slots may be edited.'});
  let replacement;
  if(b.assetId==='idle'){
   if(b.kind!=='item')return res.status(400).json({error:'Spells cannot be cleared to an equipment slot.'});
   replacement={status:'empty',confidence:1,method:'manual',name:'idle'};
  }else{
   const filename=b.kind==='spell'?'spell-mappings.json':'item-mappings.json';
   let catalog;
   try{catalog=JSON.parse(fs.readFileSync(path.join(pub,'database',filename),'utf8'));}
   catch{return res.status(503).json({error:'Asset mapping is unavailable.'});}
   const asset=catalog[b.assetId];
   if(!asset||asset.type==='placeholder'||asset.name==='idle'||typeof asset.name!=='string'||
      typeof asset.image!=='string'||asset.type!==(b.kind==='spell'?'spell':'item'))
     return res.status(400).json({error:'Unknown item or spell ID.'});
   replacement={status:'matched',confidence:1,method:'manual',id:b.assetId,name:asset.name,image:asset.image};
  }
  if(b.kind==='spell')player.battleSpell=replacement;
  else player.items[player.items.findIndex(s=>s.slot===b.slot)]={slot:b.slot,...replacement};
  draft.counts={matched:0,empty:0,uncertain:0,missing_references:0};
  for(const team of ['blue','red'])for(const p of draft.teams[team]||[]){
   for(const item of p.items||[])if(item.status in draft.counts)draft.counts[item.status]++;
   if(p.battleSpell&&p.battleSpell.status in draft.counts)draft.counts[p.battleSpell.status]++;
  }
  return res.set('Cache-Control','no-store').json(draft);
 });
 async function save(value){state=value;await fsp.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';await fsp.writeFile(temp,JSON.stringify(value,null,2));await fsp.rename(temp,file)}
 app.post('/api/build-recognition/apply',onlyLocal,async(req,res)=>{
  if(!draft||draft.counts.matched===0)return res.status(409).json({error:'Scan with confirmed matches first'});
  try{await save({active:true,teams:draft.teams,updatedAt:new Date().toISOString()});res.json({ok:true,updatedAt:state.updatedAt})}catch(e){res.status(500).json({error:'Failed saving recognition state'})}
 });
 app.post('/api/build-recognition/stop',onlyLocal,async(req,res)=>{
  try{await save({active:false,teams:null,updatedAt:new Date().toISOString()});res.json({ok:true})}catch(e){res.status(500).json({error:'Failed stopping simulation'})}
 });
}
module.exports={installBuildRecognitionRoutes};
