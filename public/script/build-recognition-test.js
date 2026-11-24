(function(){
'use strict';
const $=id=>document.getElementById(id);
const status=$('status'),teams=$('teams');let previewUrl=null;
function info(s){status.textContent=s;}
async function request(url,options={}){const response=await fetch(url,{cache:'no-store',...options});const body=await response.json();if(!response.ok)throw Error(body.error||'HTTP '+response.status);return body;}
function slot(s,isSpell=false){
 const node=document.createElement('div');node.className='slot '+s.status+(isSpell?' spell':'');
 node.title=[s.name||s.candidate||s.status,'similarity '+(s.confidence||0),s.scoreGap!=null?'gap '+s.scoreGap:'',s.reason?'reason '+s.reason:'',s.method?'method '+s.method:'',s.diagnostic?'original '+s.diagnostic.originalConfidence+' / enhanced '+s.diagnostic.enhancedConfidence:'',...(s.alternatives||[]).map(x=>x.name+' '+x.confidence)].filter(Boolean).join(' · ');
 if(s.status==='matched'&&s.image){const image=document.createElement('img');image.src=s.image;image.alt=s.name;node.appendChild(image);}
 else if(s.status==='empty'&&!isSpell){const image=document.createElement('img');image.src='/Assets/Itemandspell/idle.png';image.alt='Empty item slot (idle)';node.appendChild(image);}
 else node.textContent=s.status==='empty'?'—':s.status==='uncertain'?'~':'?';
 return node;
}
function render(data){
 teams.replaceChildren();
 $('summary').textContent='Matched: '+data.counts.matched+' · Empty: '+data.counts.empty+' · Uncertain: '+data.counts.uncertain+' · Missing reference: '+data.counts.missing_references+' · Recovered with enhancement: '+(data.diagnostics?.enhancedMatches||0)+' · Preprocessing conflicts: '+(data.diagnostics?.conflictingResults||0);
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
const deviceSelect=$('adb-device');
const adbStatus=$('adb-status');
let scanning=false,autoEnabled=false,autoTimer=null,knownSerials=new Set();
const AUTO_SCAN_INTERVAL_MS=5000;
function adbInfo(message,error=false){
 adbStatus.textContent=message;
 adbStatus.dataset.error=error?'true':'false';
}
function selectedDevice(){return deviceSelect.value;}
function controls(){
 const authorized=knownSerials.has(selectedDevice());
 $('scan').disabled=scanning;
 $('adb-refresh').disabled=scanning;
 deviceSelect.disabled=scanning;
 $('adb-capture').disabled=scanning||autoEnabled||!authorized;
 $('adb-auto-start').disabled=scanning||autoEnabled||!authorized;
 $('adb-auto-stop').disabled=!autoEnabled;
}
function stopAutoScan(message){
 autoEnabled=false;
 if(autoTimer!==null){clearTimeout(autoTimer);autoTimer=null;}
 if(message)adbInfo(message);
 controls();
}
function preview(blob){
 if(previewUrl)URL.revokeObjectURL(previewUrl);
 previewUrl=URL.createObjectURL(blob);
 $('preview').src=previewUrl;
 $('preview').hidden=false;
}
async function scanPNG(blob){
 $('apply').disabled=true;
 const result=await request('/api/build-recognition/scan',{
  method:'POST',headers:{'Content-Type':'image/png'},body:blob
 });
 render(result);
 $('apply').disabled=result.counts.matched===0;
 return result;
}
async function readADBFrame(serial){
 const response=await fetch('/api/adb/frame?serial='+encodeURIComponent(serial),{cache:'no-store'});
 if(!response.ok){
  let message='ADB frame HTTP '+response.status;
  try{const body=await response.json();message=body.message||body.error||message;}catch{}
  throw Error(message);
 }
 const blob=await response.blob();
 if(!blob.type.toLowerCase().includes('image/png'))throw Error('ADB did not return PNG image data.');
 if(blob.size>12*1024*1024)throw Error('ADB screenshot is larger than the 12MB scan limit.');
 return blob;
}
async function captureAndScan(){
 if(scanning)return false;
 const serial=selectedDevice();
 if(!knownSerials.has(serial)){adbInfo('Select an authorized Android device first.',true);return false;}
 scanning=true;controls();
 adbInfo('Capturing PNG from '+serial+'…');
 try{
  const blob=await readADBFrame(serial);
  preview(blob);
  adbInfo('Recognizing equipment from '+serial+'…');
  const result=await scanPNG(blob);
  adbInfo('Scan complete: '+result.counts.matched+' matched, '+result.counts.uncertain+' uncertain, '+result.counts.empty+' empty. Review results before Apply.');
  return true;
 }catch(e){
  $('apply').disabled=true;
  adbInfo('Capture/scan failed: '+e.message,true);
  if(autoEnabled)stopAutoScan('Auto Scan stopped: '+e.message);
  return false;
 }finally{scanning=false;controls();}
}
async function refreshDevices(){
 if(scanning)return;
 adbInfo('Checking connected Android devices…');
 $('adb-refresh').disabled=true;
 try{
  const response=await request('/api/adb/devices');
  const devices=Array.isArray(response.devices)?response.devices:[];
  knownSerials=new Set(devices.filter(d=>d.status==='device').map(d=>d.serial));
  const previouslySelected=deviceSelect.value;
  deviceSelect.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Select an authorized device';
  deviceSelect.appendChild(placeholder);
  for(const device of devices){
   const option=document.createElement('option');
   option.value=device.serial;
   option.textContent=device.serial+' ('+device.status+')';
   option.disabled=device.status!=='device';
   deviceSelect.appendChild(option);
  }
  if(knownSerials.has(previouslySelected))deviceSelect.value=previouslySelected;
  else if(knownSerials.size===1)deviceSelect.value=[...knownSerials][0];
  if(autoEnabled&&!knownSerials.has(deviceSelect.value))stopAutoScan('Auto Scan stopped: selected device disconnected.');
  const unauthorized=devices.filter(d=>d.status!=='device').length;
  adbInfo(knownSerials.size+' authorized device(s) found.'+(unauthorized?' '+unauthorized+' offline/unauthorized; accept USB debugging on the phone.':''));
 }catch(e){
  knownSerials=new Set();
  deviceSelect.replaceChildren();
  const o=document.createElement('option');o.value='';o.textContent='ADB unavailable';deviceSelect.appendChild(o);
  stopAutoScan();
  adbInfo('Unable to list devices: '+e.message+'. Check Android Platform Tools / ADB_PATH.',true);
 }finally{controls();}
}
$('scan').onclick=async()=>{
 if(autoEnabled)stopAutoScan('Auto Scan stopped for manual screenshot upload.');
 const f=$('upload').files[0];
 if(!f||!(f.type==='image/png'||f.name.toLowerCase().endsWith('.png'))){
  info('Select a PNG screenshot first.');return;
 }
 if(scanning)return;
 scanning=true;controls();
 preview(f);
 info('Scanning uploaded PNG…');
 try{
  const result=await scanPNG(f);
  info('Templates found: '+result.referenceCount.items+' item, '+result.referenceCount.spells+' spell. '+(result.message||'Review before applying.'));
 }catch(e){$('apply').disabled=true;info(e.message);}
 finally{scanning=false;controls();}
};
$('adb-refresh').onclick=refreshDevices;
deviceSelect.onchange=()=>{if(autoEnabled)stopAutoScan('Auto Scan stopped: device selection changed.');controls();};
$('adb-capture').onclick=()=>{void captureAndScan();};
$('adb-auto-start').onclick=()=>{
 if(autoEnabled||scanning||!knownSerials.has(selectedDevice()))return;
 autoEnabled=true;controls();
 const cycle=async()=>{
  if(!autoEnabled)return;
  const ok=await captureAndScan();
  if(!autoEnabled)return;
  if(!ok){stopAutoScan();return;}
  autoTimer=setTimeout(cycle,AUTO_SCAN_INTERVAL_MS);
 };
 void cycle();
};
$('adb-auto-stop').onclick=()=>stopAutoScan('Auto Scan stopped. Last preview remains available.');
$('apply').onclick=async()=>{
 if(scanning){info('Wait for the current scan to finish before applying.');return;}
 if(autoEnabled)stopAutoScan('Auto Scan stopped while applying reviewed results.');
 try{const data=await request('/api/build-recognition/apply',{method:'POST'});info('Applied at '+data.updatedAt+'. Open builds.html in another tab.');}
 catch(e){info(e.message);}
};
$('stop').onclick=async()=>{
 if(autoEnabled)stopAutoScan('Auto Scan stopped.');
 if(scanning){info('Wait for the current scan before stopping the simulation.');return;}
 try{await request('/api/build-recognition/stop',{method:'POST'});info('Simulation stopped; manual builds unchanged.');}
 catch(e){info(e.message);}
};
window.addEventListener('pagehide',()=>{
 stopAutoScan();
 if(previewUrl)URL.revokeObjectURL(previewUrl);
});
controls();
void refreshDevices();
request('/api/build-recognition/status')
 .then(s=>info('Ready. '+s.items+' item and '+s.spells+' spell references available; '+s.missingItems+' item and '+s.missingSpells+' spell PNGs missing.'))
 .catch(e=>info('Service unavailable: '+e.message));
})();
