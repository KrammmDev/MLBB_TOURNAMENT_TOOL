(function(){
'use strict';
// Keep recognized screenshot state independent from matchdatateam.json and the existing build.js writer.
async function update(){
 try{
  const response=await fetch('/api/build-recognition/state',{cache:'no-store'});if(!response.ok)return;
  const state=await response.json();
  if(!state.active||!state.teams){document.querySelectorAll('.recognized-spell').forEach(el=>el.remove());return;}
  for(const team of ['blue','red'])for(const player of state.teams[team]||[]){
   const parent=document.getElementById(team+'side'+player.player_index);if(!parent)continue;
   for(const slot of player.items||[]){
    const el=parent.querySelector('#item'+slot.slot);if(!el)continue;
    if(slot.status==='matched'&&slot.image)el.style.backgroundImage='url('+JSON.stringify(slot.image)+')';
    else if(slot.status==='empty')el.style.backgroundImage="url('/Assets/Itemandspell/idle.png')";
   }
   const heroNum=player.player_index+(team==='red'?5:0);
   const heroImg=document.getElementById('image-display-'+heroNum);
   const spell=player.battleSpell;if(!heroImg||!heroImg.parentElement)continue;
   const box=heroImg.parentElement;let icon=box.querySelector('.recognized-spell');
   if(spell&&spell.status==='matched'&&spell.image){
    box.style.position='relative';
    if(!icon){icon=document.createElement('img');icon.className='recognized-spell';icon.style.cssText='position:absolute;right:0;bottom:0;width:26px;height:26px;object-fit:contain;z-index:4;pointer-events:none';box.appendChild(icon);}
    icon.src=spell.image;icon.title='Detected: '+spell.name;
   }else if(icon)icon.remove();
  }
 }catch(e){console.warn('Build recognition overlay unavailable',e)}
}
setInterval(update,1000);update();
})();