import {LocalSpeech,checkLocalMicrophone} from './local-speech.mjs';
import {drawDiscScene,sidebarSeatInset} from './scene3d.mjs';
import {parseGateCommand,gateHypothesesAt,gateAlignmentDegrees,withTensionedFirstDisc,gateCommandAlreadyApplied,falseGatesAt,createPickingSequence,pickingSequenceAt,gateEntryOrder,gateTableCsv} from './voice-commands.mjs';
import {DEFAULT_CONFIG,validateConfig,emptyGeometry,validateSession,clamp,stateAt} from './model.mjs';
const $=id=>document.getElementById(id),scene=$('scene'),storageKey='disc-studio-voice-v1';
let session=validateSession({version:1,config:DEFAULT_CONFIG,events:[],duration:0});
// Bring forward only the old notebook's hypotheses and disc count.
try{
 const saved=localStorage.getItem(storageKey)||localStorage.getItem('disc-studio-v1');
 if(saved){const old=validateSession(JSON.parse(saved));session=validateSession({version:1,config:{...DEFAULT_CONFIG,discCount:old.config.discCount},title:old.title,events:old.events.filter(e=>['gate_hypothesis','gate_clear','gate_reset_all','false_gate_hypothesis','false_gate_clear'].includes(e.type)),duration:0});}
}catch{$('voice-status').textContent='Could not restore saved entries. New entries can still be added.';}
$('disc-count').value=session.config.discCount;
let sequence=0;
let yaw=-.85,pitch=.38,zoom=1,drag=null;
let activeDisc=Math.max(0,(session.events.findLast(e=>e.type==='gate_hypothesis')?.disc??2)-1),tipMotion={from:1,to:1,start:0,current:1};
const undoIds=[];
const libraryKey='disc-studio-locks-v1';let locks=[],activeLockId=null;
try{
 const saved=JSON.parse(localStorage.getItem(libraryKey)||'null');
 if(saved?.version===1&&Array.isArray(saved.locks)){
  locks=saved.locks.map(lock=>{if(typeof lock.id!=='string'||!lock.id||typeof lock.name!=='string')throw Error('Invalid saved lock.');return {...lock,session:validateSession(lock.session)};});
  activeLockId=locks.some(lock=>lock.id===saved.activeId)?saved.activeId:null;
 }
}catch{$('lock-status').textContent='Could not restore the saved lock list. Your current notebook is still available.';}
$('lock-name').value=locks.find(lock=>lock.id===activeLockId)?.name||(session.title==='Untitled session'?'':session.title);
function refreshLocks(){
 $('lock-list').replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=locks.length?'Choose a saved lock':'No saved locks yet';$('lock-list').append(placeholder);
 for(const lock of locks){const option=document.createElement('option');option.value=lock.id;option.textContent=lock.name;$('lock-list').append(option);}
 $('lock-list').value=activeLockId??'';$('lock-summary').textContent=locks.find(lock=>lock.id===activeLockId)?.name||'Unsaved lock';
}
function writeLibrary(){localStorage.setItem(libraryKey,JSON.stringify({version:1,activeId:activeLockId,locks}));}
function saveNamedLock(){
 const name=$('lock-name').value.trim()||'Untitled lock';
 try{
  const id=activeLockId||crypto.randomUUID(),saved=validateSession({...session,title:name});
  const lock={id,name,updatedAt:new Date().toISOString(),session:saved};
  const next=locks.filter(item=>item.id!==id);next.push(lock);
  localStorage.setItem(libraryKey,JSON.stringify({version:1,activeId:id,locks:next}));
  locks=next;activeLockId=id;session=saved;$('lock-name').value=name;refreshLocks();
  if(!persist())return false;
  $('lock-status').textContent=`Saved “${name}”. Further observations save automatically in this browser.`;return true;
 }catch(error){$('lock-status').textContent=`Could not save this lock: ${error.message}. Export JSON to keep a file copy.`;return false;}
}
function keepCurrentLock(){return !activeLockId&&session.events.length?saveNamedLock():persist();}
function openNotebook(next,id,name){
 stopVoice();session=validateSession(next);activeLockId=id;activeDisc=1;undoIds.length=0;sequence++;
 $('disc-count').value=session.config.discCount;$('lock-name').value=name;refreshLocks();renderNotebook();persist();
 commandStatus('Notebook opened. Disc 1 can be adjusted with the tensioner.');
}
$('lock-save').addEventListener('click',saveNamedLock);
$('lock-name').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveNamedLock();}});
$('lock-load').addEventListener('click',()=>{
 const id=$('lock-list').value;if(!id){$('lock-status').textContent='Choose a saved lock first.';return;}
 if(!keepCurrentLock())return;
 const lock=locks.find(item=>item.id===id);openNotebook(lock.session,lock.id,lock.name);$('lock-status').textContent=`Opened “${lock.name}”.`;
});
$('lock-new').addEventListener('click',()=>{
 if(!keepCurrentLock())return;
 openNotebook({version:1,config:{...DEFAULT_CONFIG,discCount:session.config.discCount},events:[],duration:0},null,'');
 $('lock-status').textContent='New notebook. Enter a lock name and Save lock.';$('lock-name').focus();
});
$('lock-export').addEventListener('click',()=>{
 const name=$('lock-name').value.trim()||'Untitled lock',snapshot=validateSession({...session,title:name});
 const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=(name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,80)||'lock')+'.disc-lock.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('lock-status').textContent=`Exported “${name}” with its disc count and full observation history.`;
});
$('lock-export-table').addEventListener('click',()=>{
 const name=$('lock-name').value.trim()||'Untitled lock';
 const csv=gateTableCsv(session.events,session.config.discCount,session.config.sidebarAngleDeg);
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=(name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,80)||'lock')+'-gate-table.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('lock-status').textContent=`Exported “${name}” gate table with true and false gates as separate steps in recorded order. Discs without a true gate are listed last without a step number.`;
});
$('lock-import').addEventListener('click',()=>$('lock-file').click());
$('lock-file').addEventListener('change',async()=>{
 const file=$('lock-file').files[0];if(!file)return;
 try{
  if(file.size>5*1024*1024)throw Error('Choose a JSON notebook smaller than 5 MB.');
  const next=validateSession(JSON.parse(await file.text()));
  if(!keepCurrentLock())return;
  const name=next.title==='Untitled session'?file.name.replace(/\.json$/i,''):next.title;
  openNotebook(next,null,name);saveNamedLock();
 }catch(error){$('lock-status').textContent=`Import failed: ${error.message}. The current notebook was kept.`;}
 finally{$('lock-file').value='';}
});
refreshLocks();
function voiceStatus(text){$('voice-status').textContent=text;}
function commandStatus(text){$('command-status').textContent=text;$('touch-status').textContent=text;}
function persist(){try{
 localStorage.setItem(storageKey,JSON.stringify(session));
 if(activeLockId){const lock=locks.find(lock=>lock.id===activeLockId);if(lock){lock.session=JSON.parse(JSON.stringify(session));lock.updatedAt=new Date().toISOString();}}
 writeLibrary();return true;
}catch{$('lock-status').textContent='Browser storage is unavailable or full. Export JSON to keep a copy.';return false;}}
function renderNotebook(){
 syncTouchControls();refreshPlaybackControls();
 const gates=gateHypothesesAt(session.events,Infinity,session.config.discCount),order=gateEntryOrder(session.events,session.config.discCount);$('gate-notebook').replaceChildren();
 gates.forEach((gate,i)=>{if(!gate)return;const card=document.createElement('div');card.className='gate-card';card.dataset.disc=i+1;
  const title=document.createElement('strong');title.textContent=`Disc ${i+1} · ${gate.from}–${gate.to} ${gate.units} · step ${order.indexOf(i)+1}`;
  const detail=document.createElement('p');detail.textContent=gate.degreesPerUnit===null?'Suspected gate · mapping unknown':`Suspected gate · ${(gate.from*gate.degreesPerUnit).toFixed(1)}°–${(gate.to*gate.degreesPerUnit).toFixed(1)}°`;
  const remove=document.createElement('button');remove.textContent='Clear';remove.addEventListener('click',()=>applyCommand(`clear disc ${i+1}`));card.append(title,detail,remove);$('gate-notebook').append(card);
 });
 falseGatesAt(session.events,Infinity,session.config.discCount).forEach((gates,i)=>{
  if(!gates.length)return;
  const card=document.createElement('div');card.className='gate-card false-gate-card';card.dataset.falseDisc=i+1;
  const title=document.createElement('strong');title.textContent=`Disc ${i+1} · false gates`;
  const detail=document.createElement('p');detail.textContent=gates.map(gate=>`${gate.from}–${gate.to} ${gate.units}`).join(' · ');
  const clear=document.createElement('button');clear.textContent='Clear false gates';clear.addEventListener('click',()=>applyCommand(`clear false gates disc ${i+1}`));
  card.append(title,detail,clear);$('gate-notebook').append(card);
 });
}
function applyCommand(transcript){
 try{
  const command=parseGateCommand(transcript,session.config.discCount);
  if(gateCommandAlreadyApplied(command,session.events)){if(command.disc>=1&&activeDisc!==command.disc-1){activeDisc=command.disc-1;sequence++;}syncTouchControls();commandStatus(command.type==='gate_reset_all'?'All discs are already reset · no duplicate added.':`Already recorded for disc ${command.disc} · no duplicate added.`);return;}
  const event={...command,id:crypto.randomUUID(),time:Math.max(0,...session.events.map(e=>e.time))+.001,source:'manual',note:String(transcript).slice(0,500),units:'marks',degreesPerUnit:45};
  const checked=validateSession({...session,events:[...session.events,event]});session=checked;if(command.type==='gate_reset_all')activeDisc=1;if(command.disc>=1)activeDisc=command.disc-1;undoIds.push(event.id);sequence++;renderNotebook();
  commandStatus(command.type==='gate_reset_all'?'Reset all discs. Disc 1 stays set at 0 marks by the tensioner.':command.type==='false_gate_clear'?`Cleared false gates for disc ${command.disc}.`:command.type==='gate_clear'?`Reset disc ${command.disc}.`:command.type==='false_gate_hypothesis'?`Disc ${command.disc}: false gate ${command.from}–${command.to} marks (small notch).`:`Disc ${command.disc}: suspected gate ${command.from}–${command.to} marks.`);persist();
 }catch(error){commandStatus(error.message);}
}
// Touch edits are a draft until Save, so a range remains one undoable observation.
function syncTouchControls(){
 const selected=clamp(activeDisc+1,1,session.config.discCount);
 $('touch-disc').replaceChildren(...Array.from({length:session.config.discCount},(_,i)=>{const option=document.createElement('option');option.value=i+1;option.textContent=`Disc ${i+1}`;return option;}));
 $('touch-disc').value=selected;
 const gate=$('touch-kind').checked?falseGatesAt(session.events,Infinity,session.config.discCount)[selected-1].at(-1):gateHypothesesAt(session.events,Infinity,session.config.discCount)[selected-1];
 $('touch-start').value=gate?.from??0;$('touch-end').value=gate?.to??0;
 updateTouchBounds();
}
function updateTouchBounds(){
 const disc=Number($('touch-disc').value),start=Number($('touch-start').value),end=Number($('touch-end').value);
 $('touch-disc-prev').disabled=disc<=1;$('touch-disc-next').disabled=disc>=session.config.discCount;
 $('touch-start-minus').disabled=start<=0;$('touch-start-plus').disabled=start>=16;
 $('touch-end-minus').disabled=end<=start;$('touch-end-plus').disabled=end>=16;
}
function selectTouchDisc(disc){activeDisc=disc-1;sequence++;syncTouchControls();$('touch-status').textContent=`Disc ${disc} selected. Set its range, then Save gate.`;}
let discDigits='',lastDiscDigit=0;
$('touch-disc').addEventListener('keydown',event=>{
 if(event.ctrlKey||event.metaKey||event.altKey||!/^\d$/.test(event.key))return;
 event.preventDefault();const now=performance.now();
 discDigits=(now-lastDiscDigit<900?discDigits:'')+event.key;lastDiscDigit=now;
 if(discDigits.length>2)discDigits=event.key;
 const disc=Number(discDigits);
 if(disc>=1&&disc<=session.config.discCount)selectTouchDisc(disc);
 else $('touch-status').textContent=`Choose disc 1–${session.config.discCount}.`;
});
$('touch-disc').addEventListener('blur',()=>{discDigits='';lastDiscDigit=0;});
$('touch-kind').addEventListener('change',()=>{$('touch-kind-name').textContent=$('touch-kind').checked?'False gate':'True gate';$('touch-kind-hint').textContent=$('touch-kind').checked?'Smaller notch':'Gate range';syncTouchControls();$('touch-save').querySelector('span').textContent=$('touch-kind').checked?'Add false gate':'Save gate';});
$('touch-disc').addEventListener('change',()=>selectTouchDisc(Number($('touch-disc').value)));
$('touch-disc-prev').addEventListener('click',()=>selectTouchDisc(Math.max(1,Number($('touch-disc').value)-1)));
$('touch-disc-next').addEventListener('click',()=>selectTouchDisc(Math.min(session.config.discCount,Number($('touch-disc').value)+1)));
for(const field of ['start','end']){
 for(const [suffix,delta] of [['minus',-.5],['plus',.5]])$('touch-'+field+'-'+suffix).addEventListener('click',()=>{
  const input=$('touch-'+field),current=Number(input.value);input.value=clamp(Math.round((current+delta)*100)/100,field==='end'?Number($('touch-start').value):0,16);
  if(field==='start'&&Number($('touch-end').value)<Number(input.value))$('touch-end').value=input.value;
  updateTouchBounds();$('touch-status').textContent='Range changed · tap Save gate to apply.';
 });
 $('touch-'+field).addEventListener('focus',event=>event.target.select());
 $('touch-'+field).addEventListener('input',()=>{updateTouchBounds();$('touch-status').textContent='Range changed · tap Save gate to apply.';});
}
$('touch-save').addEventListener('click',()=>{
 const start=Number($('touch-start').value),end=Number($('touch-end').value);
 if(!$('touch-start').value||!$('touch-end').value||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>16||end<start){$('touch-status').textContent='Enter a start and end from 0 to 16, with the end at or above the start.';return;}
 applyCommand(`disc ${$('touch-disc').value} ${$('touch-kind').checked?'false gate':'gate'} from ${start} to ${end}`);
});
$('touch-reset').addEventListener('click',()=>{applyCommand(`reset disc ${$('touch-disc').value}`);syncTouchControls();});
$('touch-undo').addEventListener('click',()=>$('voice-undo').click());
// Capture app shortcuts before ordinary page defaults, while leaving other text
// editors and modified browser shortcuts alone. Extensions may intercept earlier.
const manualFields=['touch-disc','touch-start','touch-end','touch-save'];
let keyboardField='touch-disc';
$('touch-keyboard').addEventListener('click',()=>{
 if($('touch-content').hidden)$('touch-toggle').click();
 $('touch-start').focus();$('touch-status').textContent='Keyboard ready. F/T selects gate type; Space moves fields; arrows adjust; Enter saves. If Vimium intercepts keys, press i or exclude this site in Vimium.';
});
document.querySelector('.touch-panel').addEventListener('focusin',event=>{
 const id=event.target.id;
 if(manualFields.includes(id))keyboardField=id;
 else if(id.startsWith('touch-start-'))keyboardField='touch-start';
 else if(id.startsWith('touch-end-'))keyboardField='touch-end';
 else if(id.startsWith('touch-disc-'))keyboardField='touch-disc';
});
window.addEventListener('keydown',event=>{
 if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.defaultPrevented)return;
 const target=event.target,inManual=target.closest?.('#touch-content');
 if(!inManual&&target.closest?.('input,textarea,select,button,[contenteditable]'))return;
 const consume=()=>{event.preventDefault();event.stopPropagation();};
 const key=event.key.toLowerCase();
 if(key==='f'||key==='t'){
  consume();if($('touch-content').hidden)$('touch-toggle').click();
  const checked=key==='f';
  if($('touch-kind').checked!==checked){$('touch-kind').checked=checked;$('touch-kind').dispatchEvent(new Event('change'));}
  if(!manualFields.includes(target.id))$(keyboardField==='touch-save'?'touch-start':keyboardField).focus();
  return;
 }
 if($('touch-content').hidden||target.id==='touch-kind')return;
 const field=manualFields.includes(target.id)?target.id:keyboardField;
 // Do not replace Space/Enter activation of actual buttons such as Reset/Undo.
 if(inManual&&target.matches?.('button')&&!manualFields.includes(target.id)&&[' ','Enter'].includes(event.key))return;
 if(event.key===' '){
  consume();const index=manualFields.indexOf(field);
  if(field==='touch-save'&&!event.shiftKey){$('touch-save').click();$('touch-disc').focus();}
  else $(manualFields[(index+(event.shiftKey?-1:1)+manualFields.length)%manualFields.length]).focus();
  return;
 }
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
  consume();const positive=event.key==='ArrowRight'||event.key==='ArrowUp';
  // Save has no numeric value: return to the last reading for adjustments.
  const adjusted=field==='touch-save'?'touch-end':field;
  $(adjusted).focus({preventScroll:true});
  if(adjusted==='touch-disc')$('touch-disc-'+(positive?'next':'prev')).click();
  else $(adjusted+'-'+(positive?'plus':'minus')).click();
  return;
 }
 if(event.key==='Enter'){consume();$('touch-save').click();}
},{capture:true});
function stopVoice(){speech.stop();voiceStatus('Not listening.');}
const speech=new LocalSpeech({onStatus:voiceStatus,onState:phase=>{const labels={stopped:'Stopped',preparing:'Preparing microphone…',listening:'Listening · speak now',hearing:'Hearing you · pause when finished',transcribing:'Transcribing · please wait'};$('voice-phase').textContent=labels[phase]||phase;$('voice-summary').textContent=labels[phase]||phase;$('voice-phase').dataset.phase=phase;},onLevel:({rms,speechActive,pending})=>{const db=rms>0?Math.max(-90,Math.round(20*Math.log10(rms))):-90;$('mic-level').value=clamp((db+80)/60*100,0,100);$('mic-level-text').textContent=`Input ${db} dB · ${pending?'transcribing':speechActive?'speech detected':db< -55?'very quiet input':'waiting for speech'}`;},onTranscript:text=>{$('voice-transcript').value=text;applyCommand(text);},onEnd:()=>{$('mic-level').value=0;$('mic-level-text').textContent='Microphone stopped';$('voice-start').disabled=false;$('voice-stop').disabled=true;$('mic-input').disabled=false;}});
const knownMicrophones=new Map();let inputRefresh=0;
async function refreshInputs(activeStream=null){
 if(!navigator.mediaDevices?.enumerateDevices){$('mic-devices-status').textContent='This browser cannot list microphones. System default is still available.';return;}
 const revision=++inputRefresh;
 try{
  let saved='';try{saved=localStorage.getItem('disc-studio-microphone')||'';}catch{}
  let selected=$('mic-input').value||saved;
  const [browserResult,nativeResult]=await Promise.allSettled([navigator.mediaDevices.enumerateDevices(),fetch('/api/speech/inputs').then(response=>response.json())]);
  const devices=browserResult.status==='fulfilled'?browserResult.value:[],nativeInputs=nativeResult.status==='fulfilled'?(nativeResult.value.inputs??[]):[];
  if(nativeResult.status==='fulfilled'&&nativeResult.value.engine==='cloudflare-whisper')$('speech-notice').textContent='Voice commands are transcribed by Cloudflare Workers AI. Audio is sent only while listening and is not saved by this app. Your lock notebooks stay in this browser. Speak when Listening appears, pause after a command, and wait while Transcribing. You can also use manual input.';
  if(revision!==inputRefresh)return;
  const inputs=devices.filter(device=>device.kind==='audioinput'&&device.deviceId);
  // Query while capture is active. Keep previously authorized entries if the
  // browser hides its list again after a one-time permission is released.
  inputs.forEach(device=>knownMicrophones.set(device.deviceId,device.label||knownMicrophones.get(device.deviceId)||`Microphone ${knownMicrophones.size+1}`));
  const track=activeStream?.getAudioTracks?.()[0],settings=track?.getSettings();
  if(track?.label&&settings?.deviceId&&settings.deviceId!=='default')knownMicrophones.set(settings.deviceId,track.label);
  const defaultLabel=selected===''&&track?.label?`System default · ${track.label}`:'System default microphone';
  const options=[new Option(defaultLabel,'')];
  nativeInputs.forEach(input=>options.push(new Option(`${input.label} · direct local input${input.isDefault?' (default)':''}`,`native:${input.id}`)));
  if(!selected&&devices.filter(device=>device.kind==='audioinput'&&device.deviceId).length===0&&nativeInputs.length)selected=`native:${(nativeInputs.find(input=>input.isDefault)||nativeInputs[0]).id}`;
  for(const [id,label] of knownMicrophones)if(id!=='default')options.push(new Option(label,id));
  const defaultDevice=inputs.find(device=>device.deviceId==='default');if(defaultDevice?.label)options[0].textContent=defaultDevice.label;
  $('mic-input').replaceChildren(...options);if(options.some(option=>option.value===selected))$('mic-input').value=selected;
  $('mic-devices-status').textContent=nativeInputs.length?'Direct local inputs work even when the browser cannot find a microphone. Choose one, then start listening.':options.length>1?'Choose an input, then start listening.':track?'The browser exposes only its current/default input. You can use it, or choose another input in the browser’s site microphone settings.':'Click Refresh microphones and allow microphone access to reveal available inputs.';
 }catch(error){$('mic-devices-status').textContent=`Microphone list unavailable (${error.name}). Click Refresh microphones to request access; System default remains available.`;}
}
$('mic-refresh').addEventListener('click',async()=>{
 $('mic-refresh').disabled=true;let temporary;
 try{
  await refreshInputs(speech.stream||micStream);
  if([...$('mic-input').options].some(option=>option.value.startsWith('native:')))return;
  const active=speech.stream||micStream;
  if(active)await refreshInputs(active);
  else{temporary=await navigator.mediaDevices.getUserMedia({audio:true,video:false});await refreshInputs(temporary);}
 }catch(error){$('mic-devices-status').textContent=`Microphone access failed (${error.name}): ${error.message}. ${error.name==='NotFoundError'?'The browser cannot see an audio input; select a direct local input if available.':'Allow microphone access for this site, then retry.'}`;}
 finally{temporary?.getTracks().forEach(track=>track.stop());$('mic-refresh').disabled=false;}
});
$('mic-input').addEventListener('change',()=>{try{localStorage.setItem('disc-studio-microphone',$('mic-input').value);}catch{}});
navigator.mediaDevices?.addEventListener('devicechange',()=>refreshInputs(speech.stream||micStream));
refreshInputs();
$('voice-apply').addEventListener('click',()=>applyCommand($('voice-transcript').value));
$('voice-transcript').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyCommand(event.target.value);}});
$('voice-undo').addEventListener('click',()=>{
 let id;while(undoIds.length){const candidate=undoIds.pop();if(session.events.some(e=>e.id===candidate)){id=candidate;break;}}
 id??=session.events.at(-1)?.id;if(!id){voiceStatus('No entries to undo.');return;}
 session.events=session.events.filter(e=>e.id!==id);sequence++;renderNotebook();commandStatus('Last entry removed.');persist();
});
$('disc-count').addEventListener('change',()=>{
 const count=Number($('disc-count').value);
 try{const config=validateConfig({...session.config,discCount:count,discGeometry:Array.from({length:count},emptyGeometry)});session.config=config;sequence++;renderNotebook();persist();}
 catch(error){$('disc-count').value=session.config.discCount;voiceStatus(error.message);}
});
$('voice-stop').addEventListener('click',stopVoice);
$('voice-start').addEventListener('click',async()=>{
 $('voice-start').disabled=true;$('voice-stop').disabled=false;$('mic-input').disabled=true;
 await speech.start($('mic-input').value);await refreshInputs(speech.stream);
});
let micStream=null;
$('mic-check').addEventListener('click',async()=>{
 stopVoice();$('mic-check').disabled=true;$('voice-start').disabled=true;let context;
 try{
  if($('mic-input').value.startsWith('native:')){const status=await checkLocalMicrophone($('mic-input').value.slice(7),text=>$('mic-status').textContent=text);$('mic-status').textContent=status.peak>.008?`Audio detected from ${status.label}. Direct local microphone capture works.`:`Opened ${status.label} directly, but little or no audio was detected. Check microphone gain and hardware mute.`;return;}
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone access is unavailable in this browser.');
  $('mic-status').textContent='Requesting microphone access…';
  micStream=await navigator.mediaDevices.getUserMedia({audio:$('mic-input').value?{deviceId:{exact:$('mic-input').value}}:true,video:false});
  await refreshInputs(micStream);
  const track=micStream.getAudioTracks()[0],name=track.label||'default microphone';
  const AudioContext=window.AudioContext||window.webkitAudioContext;context=new AudioContext();await context.resume();
  const analyser=context.createAnalyser();analyser.fftSize=2048;context.createMediaStreamSource(micStream).connect(analyser);
  const samples=new Float32Array(analyser.fftSize);let peak=0;
  for(let i=0;i<50;i++){
   analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);peak=Math.max(peak,rms);
   $('mic-status').textContent=`Testing ${name}: input level ${Math.min(100,Math.round(rms*500))}% · speak now (${Math.ceil((50-i)/10)}s).`;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  $('mic-status').textContent=peak>.008?`Audio detected from ${name}. Microphone capture works. Start listening enables speech recognition.`:`Microphone opened: ${name}, but little or no audio was detected. Check mute/gain and choose the intended input in your browser or system sound settings.`;
 }catch(error){$('mic-status').textContent=error.name==='NotFoundError'?'The browser cannot find a microphone. Check site permissions and connect an audio input.':`Microphone check failed (${error.name}): ${error.message}`;}
 finally{micStream?.getTracks().forEach(track=>track.stop());micStream=null;await context?.close();$('mic-check').disabled=false;$('voice-start').disabled=false;}
});
window.addEventListener('pagehide',()=>micStream?.getTracks().forEach(track=>track.stop()));
window.addEventListener('pagehide',stopVoice);
scene.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY};scene.setPointerCapture(event.pointerId);});
scene.addEventListener('pointermove',event=>{if(!drag)return;yaw+=(event.clientX-drag.x)*.008;pitch=clamp(pitch-(event.clientY-drag.y)*.008,-1.2,1.2);drag={x:event.clientX,y:event.clientY};});
scene.addEventListener('pointerup',()=>drag=null);scene.addEventListener('pointercancel',()=>drag=null);
scene.addEventListener('wheel',event=>{event.preventDefault();zoom=clamp(zoom-event.deltaY*.001,.55,1.9);},{passive:false});
let lastSequence=-1,state,motions=[],bar={from:0,to:0,start:0,current:0};
let playback=null,hasPlayed=false,completedCoreRotation=0;
function refreshPlaybackControls(){
 const gates=gateHypothesesAt(session.events,Infinity,session.config.discCount),missing=gates.map((gate,i)=>(i>0||gate)&&(!gate||gate.degreesPerUnit===null)?i+1:null).filter(Boolean);
 $('picking-play').disabled=missing.length>0||Boolean(playback);$('picking-stop').disabled=!playback;
 $('picking-play').textContent=hasPlayed?'Replay picking sequence':'Play picking sequence';
 if(!playback){$('picking-status').textContent=missing.length?`Set true gates for disc${missing.length>1?'s':''} ${missing.join(', ')} to play.`:`Ready · ${gates[0]?'disc 1 adjustable':'disc 1 held at 0'} → ${gateEntryOrder(session.events,session.config.discCount).map(index=>`disc ${index+1}`).join(' → ')}`;$('picking-status').dataset.phase='ready';}
}
$('picking-play').addEventListener('click',()=>{
 try{
  const gates=withTensionedFirstDisc(gateHypothesesAt(session.events,Infinity,session.config.discCount),session.config.sidebarAngleDeg);
  const timeline=createPickingSequence(gates,{order:gateEntryOrder(session.events,session.config.discCount),sidebarAngleDeg:session.config.sidebarAngleDeg,rotations:state?.discs.map(d=>d.alignmentRotationDeg??0),depth:state?.pickDepthIndex??1,tipAngle:state?.pickAngleDeg??0,sidebarInset:bar.current,coreRotationDeg:state?.coreRotationDeg??0,loweredInset:sidebarSeatInset(session.config)});
  completedCoreRotation=0;playback={started:performance.now(),revision:sequence,timeline};hasPlayed=true;refreshPlaybackControls();
 }catch(error){$('picking-status').textContent=error.message;}
});
$('picking-stop').addEventListener('click',()=>{playback=null;sequence++;refreshPlaybackControls();$('picking-status').textContent='Animation stopped · returning to the notebook view.';});
const tween=(from,to,start,now)=>{const t=clamp((now-start)/700,0,1);return from+(to-from)*(t*t*(3-2*t));};
function frame(now){
 if(playback&&playback.revision!==sequence){playback=null;refreshPlaybackControls();}
 if(sequence!==lastSequence){
  completedCoreRotation=0;
  const previous=state;state=stateAt([],0,session.config);state.falseGateHypotheses=falseGatesAt(session.events,Infinity,session.config.discCount);state.gateHypotheses=withTensionedFirstDisc(gateHypothesesAt(session.events,Infinity,session.config.discCount),session.config.sidebarAngleDeg);
  motions=state.discs.map((_,i)=>({from:previous?.discs[i]?.alignmentRotationDeg??0,to:gateAlignmentDegrees(state.gateHypotheses[i],session.config.sidebarAngleDeg,i===0),start:now}));lastSequence=sequence;
 }
 state.discs.forEach((disc,i)=>disc.alignmentRotationDeg=tween(motions[i].from,motions[i].to,motions[i].start,now));
 activeDisc=Math.min(activeDisc,session.config.discCount-1);
 if(tipMotion.to!==activeDisc)tipMotion={from:tipMotion.current,to:activeDisc,start:now,current:tipMotion.current};
 tipMotion.current=tween(tipMotion.from,tipMotion.to,tipMotion.start,now);state.pickDepthIndex=tipMotion.current;state.pickAngleDeg=state.discs[activeDisc].alignmentRotationDeg;
 $('tool-status').textContent=`Numbered from the top/insertion end · disc 1 ${state.gateHypotheses[0].assumed?'assumed set at 0 marks':'counter-rotated to its gate'} by tensioner · turning tip at disc ${activeDisc+1}.`;
 const allMapped=state.gateHypotheses.every(g=>g&&g.degreesPerUnit!==null),settled=motions.every((motion,i)=>Math.abs(state.discs[i].alignmentRotationDeg-motion.to)<.01);
 const frontGate=state.gateHypotheses[0],frontAligned=frontGate&&Math.abs(state.discs[0].alignmentRotationDeg-gateAlignmentDegrees(frontGate,session.config.sidebarAngleDeg,true))<.01;
 const targetInset=allMapped&&settled&&frontAligned?sidebarSeatInset(session.config):0;
 if(bar.to!==targetInset)bar={from:bar.current,to:targetInset,start:now,current:bar.current};
 bar.current=tween(bar.from,bar.to,bar.start,now);state.sidebarInset=bar.current;state.coreRotationDeg=completedCoreRotation;
 $('alignment-status').textContent=allMapped&&!frontAligned?'Counter-rotating disc 1 to its gate.':allMapped?(settled?(Math.abs(bar.current-targetInset)<.01?'All marked gate midpoints aligned · sidebar lowered (simulation).':'Gate midpoints aligned · lowering sidebar…'):'Rotating discs to their marked gate midpoints…'):'Marked discs align to the sidebar. The bar stays raised until discs 2 onward have gate ranges. Disc 1 can be adjusted.';
 if(playback){
  const pose=pickingSequenceAt(playback.timeline,now-playback.started);
  state.discs.forEach((disc,i)=>disc.alignmentRotationDeg=pose.rotations[i]);
  state.pickDepthIndex=pose.depth;state.pickAngleDeg=pose.tipAngle;state.sidebarInset=pose.sidebarInset;state.coreRotationDeg=pose.coreRotationDeg;activeDisc=Math.round(pose.depth);
  tipMotion={from:pose.depth,to:pose.disc,start:now,current:pose.depth};bar={from:pose.sidebarInset,to:pose.sidebarInset,start:now,current:pose.sidebarInset};
  const labels={reset:'Returning discs to their starting positions',move:pose.disc===0?'Preparing disc 1 tensioner adjustment':`Moving pick to disc ${pose.disc+1}`,turn:`Aligning disc ${pose.disc+1}`,counterturn:'Counter-rotating disc 1 with the tensioner',hold:`Disc ${pose.disc+1} set`,sidebar:'All gates aligned · lowering sidebar into gates',unlock:'Sidebar engaged · turning the core',complete:'Lock opened · sidebar engaged and core turned'};
  $('picking-status').textContent=labels[pose.phase];$('picking-status').dataset.phase=pose.phase;$('picking-status').dataset.disc=pose.disc+1;
  $('tool-status').textContent=`Picking sequence · ${labels[pose.phase]}. Disc 1 is controlled by the tensioner.`;
  $('alignment-status').textContent=pose.phase==='unlock'||pose.done?'Sidebar seated in the gates · turning the core (simulation).':pose.phase==='sidebar'?'All selected gate midpoints aligned · lowering sidebar into gates (simulation).':'Sidebar held raised while the pick sets each disc (simulation).';
  if(pose.done){completedCoreRotation=pose.coreRotationDeg;playback=null;refreshPlaybackControls();$('picking-status').textContent=labels.complete;$('picking-status').dataset.phase='complete';}
 }
 const box=scene.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));
 if(scene.width!==w||scene.height!==h){scene.width=w;scene.height=h;}
 const ctx=scene.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 drawDiscScene(ctx,box.width,box.height,session.config,state,{yaw,pitch,zoom,exploded:true,axialScale:2,showSidebar:true,illustrativeNotches:true,showHousing:true,showDriveTabs:true,alignHypotheses:true,fromTop:true,showPick:true,pickScale:3,rectangularKeyway:true,voiceOnly:true,lightTheme:true,sketch:true});requestAnimationFrame(frame);
}
// Collapsing a panel only hides its controls; drafts and voice capture stay intact.
let panelPreferences={};
try{const saved=JSON.parse(localStorage.getItem('disc-studio-panels-v1')||'{}');if(saved&&typeof saved==='object')panelPreferences=saved;}catch{}
for(const [name,label] of [['touch','manual input'],['voice','voice notebook'],['lock','lock notebooks']]){
 const toggle=$(name+'-toggle'),content=$(name+'-content');
 function expand(expanded){
  content.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));
  toggle.textContent=expanded?'Minimize':'Expand';toggle.setAttribute('aria-label',`${expanded?'Minimize':'Expand'} ${label}`);
  toggle.closest('section').classList.toggle('is-collapsed',!expanded);
 }
 expand(typeof panelPreferences[name]==='boolean'?panelPreferences[name]:name!=='lock');
 toggle.addEventListener('click',()=>{
  const expanded=toggle.getAttribute('aria-expanded')!=='true';expand(expanded);panelPreferences[name]=expanded;
  try{localStorage.setItem('disc-studio-panels-v1',JSON.stringify(panelPreferences));}catch{}
 });
}
new ResizeObserver(entries=>document.documentElement.style.setProperty('--touch-panel-height',`${entries[0].target.getBoundingClientRect().height}px`)).observe(document.querySelector('.touch-panel'));
renderNotebook();requestAnimationFrame(frame);
