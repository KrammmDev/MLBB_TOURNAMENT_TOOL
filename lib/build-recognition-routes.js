"use strict";
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const express=require('express');
const {loadReferenceLibrary,detect}=require('./build-recognizer');
function local(req){
 const ip=req.socket.remoteAddress||'';
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))return false;
 const origin=req.get('origin');if(!origin)return true;
 try{const u=new URL(origin);return (u.hostname==='localhost'||u.hostname==='127.0.0.1')&&u.host===req.get('host')}catch{return false}
}
function installBuildRecognitionRoutes(app,options={}){
 const root=options.root||path.resolve(__dirname,'..'),pub=path.join(root,'public');
 const map=JSON.parse(fs.readFileSync(path.join(pub,'database','mlbb-ingame-item-spell-slot-map.json'),'utf8'));
 const file=path.join(root,'runtime','build-recognition-state.json');
 let state={active:false,teams:null,updatedAt:null},draft=null;
 try{const loaded=JSON.parse(fs.readFileSync(file,'utf8'));if(typeof loaded.active==='boolean')state=loaded}catch{}
 const onlyLocal=(req,res,next)=>local(req)?next():res.status(403).json({error:'Localhost only'});
 app.get('/api/build-recognition/state',(req,res)=>res.set('Cache-Control','no-store').json(state));
 app.get('/api/build-recognition/status',onlyLocal,async(req,res)=>{try{const lib=await loadReferenceLibrary(pub);res.set('Cache-Control','no-store').json({items:lib.items.length,spells:lib.spells.length,missingItems:lib.missingItems,missingSpells:lib.missingSpells,active:state.active})}catch(e){res.status(500).json({error:e.message})}});
 app.post('/api/build-recognition/scan',onlyLocal,express.raw({type:'image/png',limit:'12mb'}),async(req,res)=>{
  try{
   if(!Buffer.isBuffer(req.body)||req.body.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return res.status(400).json({error:'Upload a PNG image'});
   const lib=await loadReferenceLibrary(pub);
   draft=await detect(req.body,map,lib);
   res.json({...draft,referenceCount:{items:lib.items.length,spells:lib.spells.length},message:lib.items.length?'Review detections before Apply.':'No matching reference PNG files. Check /public/Assets/Itemandspell.'});
  }catch(e){res.status(400).json({error:e.message})}
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
