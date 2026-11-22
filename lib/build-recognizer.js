"use strict";
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
function inside(base,target){const rel=path.relative(base,target);return rel!== '..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
function entries(mapping,root){
 return Object.entries(mapping).filter(([,v])=>v&&v.type!=='placeholder'&&v.name!=='idle'&&typeof v.image==='string').map(([id,v])=>{
  let location;try{location=path.resolve(root,decodeURIComponent(v.image.replace(/^\\/+/,'')));}catch{return null}
  return inside(root,location)&&fs.existsSync(location)?{id,name:v.name,image:v.image,location}:null;
 }).filter(Boolean);
}
async function vector(bytes,region){
 let input=sharp(bytes,{limitInputPixels:20e6});if(region)input=input.extract(region);
 const {data}=await input.resize(28,28,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const result=[];
 for(let y=3;y<25;y+=2)for(let x=3;x<25;x+=2){
  const at=(y*28+x)*3,r=data[at],g=data[at+1],b=data[at+2],mean=(r+g+b)/3;
  result.push((r-mean)/255,(g-mean)/255,(b-mean)/255,mean/255);
 }
 return result;
}
function similarity(a,b){if(a.length!==b.length)throw Error('Vector size mismatch');let e=0;for(let i=0;i<a.length;i++)e+=Math.abs(a[i]-b[i]);return Math.max(0,1-e/a.length)}
async function loadReferenceLibrary(root){
 const result={items:[],spells:[],missingItems:0,missingSpells:0};
 for(const [key,file] of [['items','item-mappings.json'],['spells','spell-mappings.json']]){
  const mapping=JSON.parse(fs.readFileSync(path.join(root,'database',file),'utf8'));
  const valid=Object.values(mapping).filter(v=>v.type!=='placeholder').length;
  for(const e of entries(mapping,root)){try{result[key].push({...e,vector:await vector(fs.readFileSync(e.location))});}catch{}}
  result[key==='items'?'missingItems':'missingSpells']=valid-result[key].length;
 }
 return result;
}
function classify(sample,library,threshold,margin){
 if(!library.length)return {status:'missing_references',confidence:0};
 const ranked=library.map(v=>({entry:v,score:similarity(sample,v.vector)})).sort((a,b)=>b.score-a.score);
 const best=ranked[0],second=ranked[1],confidence=+best.score.toFixed(3);
 if(best.score<threshold||(second&&best.score-second.score<margin))return {status:'uncertain',confidence,candidate:best.entry.name};
 return {status:'matched',confidence,id:best.entry.id,name:best.entry.name,image:best.entry.image};
}
function scaled(c,sx,sy){return {left:Math.round(c.x*sx),top:Math.round(c.y*sy),width:Math.max(4,Math.round(c.width*sx)),height:Math.max(4,Math.round(c.height*sy))};}
async function detect(bytes,map,library){
 const m=await sharp(bytes,{limitInputPixels:20e6}).metadata();if(m.width<600||m.height<400)throw Error('Image too small');
 const sx=m.width/map.reference_resolution.width,sy=m.height/map.reference_resolution.height;
 const out={source:{width:m.width,height:m.height},capturedAt:new Date().toISOString(),teams:{blue:[],red:[]},counts:{matched:0,empty:0,uncertain:0,missing_references:0}};
 for(const team of ['blue','red'])for(const p of map.teams[team]){
  const player={player_index:p.player_index,items:[],battleSpell:null};
  for(const slot of p.item_slots){
   const rect=scaled(slot.crop,sx,sy);if(rect.left<0||rect.top<0||rect.left+rect.width>m.width||rect.top+rect.height>m.height)throw Error('Item crop outside image');
   const crop=await sharp(bytes).extract(rect).resize(28,28).raw().toBuffer({resolveWithObject:true});
   let dark=0;for(let y=6;y<22;y++)for(let x=6;x<22;x++){const i=(y*28+x)*crop.info.channels;if(Math.max(crop.data[i],crop.data[i+1],crop.data[i+2])<34)dark++}
   const match=dark/256>.78?{status:'empty',confidence:1}:classify(await vector(bytes,rect),library.items,.80,.014);
   out.counts[match.status]++;player.items.push({slot:slot.slot,...match});
  }
  const rect=scaled(p.battle_spell.crop,sx,sy);
  if(rect.left<0||rect.top<0||rect.left+rect.width>m.width||rect.top+rect.height>m.height)throw Error('Spell crop outside image');
  player.battleSpell=classify(await vector(bytes,rect),library.spells,.81,.02);
  out.counts[player.battleSpell.status]++;
  out.teams[team].push(player);
 }
 return out;
}
module.exports={loadReferenceLibrary,detect,classify,similarity};
