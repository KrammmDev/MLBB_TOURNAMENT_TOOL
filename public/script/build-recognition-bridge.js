(function(){
'use strict';
// Keep recognized screenshot state independent from matchdatateam.json and the existing build.js writer.
async function update(){
 try{
  const response=await fetch('/api/build-recognition/state',{cache:'no-store'});if(!response.ok)return;
  const state=await response.json();
  if(!state.active||!state.teams)return;
  for(const team of ['blue','red'])for(const player of state.teams[team]||[]){
   const parent=document.getElementById(team+'side'+player.player_index);if(!parent)continue;
   for(const slot of player.items||[]){
    const el=parent.querySelector('#item'+slot.slot);if(!el)continue;
    if(slot.status==='matched'&&slot.image)el.style.backgroundImage='url('+JSON.stringify(slot.image)+')';
    else if(slot.status==='empty')el.style.backgroundImage="url('/Assets/Itemandspell/idle.png')";
   }

  }
 }catch(e){console.warn('Build recognition overlay unavailable',e)}
}
setInterval(update,1000);update();
})();