(function(){
'use strict';
const $=id=>document.getElementById(id);
const status=$('status'),teams=$('teams');let previewUrl=null;
function info(s){status.textContent=s;}
async function request(url,options={}){const response=await fetch(url,{cache:'no-store',...options});const body=await response.json();if(!response.ok)throw Error(body.error||'HTTP '+response.status);return body;}
function slot(s,isSpell=false){
 const node=document.createElement('div');node.className='slot '+s.status+(isSpell?' spell':'');
 node.title=(s.name||s.candidate||s.status)+' · similarity '+(s.confidence||0);
 if(s.status==='matched'&&s.image){const image=document.createElement('img');image.src=s.image;image.alt=s.name;node.appendChild(image);}
 else if(s.status==='empty'&&!isSpell){const image=document.createElement('img');image.src='/Assets/Itemandspell/idle.png';image.alt='Empty item slot (idle)';node.appendChild(image);}
 else node.textContent=s.status==='empty'?'—':s.status==='uncertain'?'~':'?';
 return node;
}
function render(data){
 teams.replaceChildren();
 $('summary').textContent='Matched: '+data.counts.matched+' · Empty: '+data.counts.empty+' · Uncertain: '+data.counts.uncertain+' · Missing reference: '+data.counts.missing_references;
 for(const side of ['blue','red']){
  const section=document.createElement('section');section.className='team';
  const title=document.createElement('h3');title.textContent=side==='blue'?'Blue Team':'Red Team';section.appendChild(title);
  for(const p of data.teams[side]){
   const row=document.createElement('div');row.className='player';
   const label=document.createElement('span');label.className='pid';label.textContent='P'+p.player_index;row.appendChild(label);
   const slots=document.createElement('div');slots.className='slots';
   for(const s of p.items)slots.appendChild(slot(s));
   row.appendChild(slots);row.appendChild(slot(p.battleSpell,true));section.appendChild(row);
  }
  teams.appendChild(section);
 }
}
$('scan').onclick=async()=>{
 const f=$('upload').files[0];$('apply').disabled=true;
 if(!f||!(f.type==='image/png'||f.name.toLowerCase().endsWith('.png'))){info('Select a PNG screenshot first.');return;}
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(f);$('preview').src=previewUrl;$('preview').hidden=false;
 info('Scanning PNG…');
 try{
  const response=await request('/api/build-recognition/scan',{method:'POST',headers:{'Content-Type':'image/png'},body:f});
  render(response);$('apply').disabled=response.counts.matched===0;
  info('Templates found: '+response.referenceCount.items+' item, '+response.referenceCount.spells+' spell. '+(response.message||'Review before applying.'));
 }catch(e){info(e.message);}
};
$('apply').onclick=async()=>{try{const data=await request('/api/build-recognition/apply',{method:'POST'});info('Applied at '+data.updatedAt+'. Open builds.html in another tab.');}catch(e){info(e.message)}};
$('stop').onclick=async()=>{try{await request('/api/build-recognition/stop',{method:'POST'});info('Simulation stopped; manual builds unchanged.')}catch(e){info(e.message)}};
request('/api/build-recognition/status').then(s=>info('Ready. '+s.items+' item and '+s.spells+' spell references available; '+s.missingItems+' item and '+s.missingSpells+' spell PNGs missing.')).catch(e=>info('Service unavailable: '+e.message));
})();