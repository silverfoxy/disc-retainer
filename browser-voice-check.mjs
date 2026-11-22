import fs from 'node:fs/promises';
const target=await(await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json();const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p?.reject(Error(msg.error.message)):p?.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(msg.params));else if(msg.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});};
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<60;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out: '+expression+' status '+await ev('document.getElementById("voice-status").textContent'));}
async function file(selector,path){const doc=await send('DOM.getDocument');const node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[path]});}
await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
const injection=await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.AudioWorkletNode=class extends GainNode {constructor(context){super(context);this.port={};window.__testCapture=this;}};
const realFetch=window.fetch.bind(window);window.fetch=(url,options)=>url==='/api/speech/inputs'?Promise.resolve(new Response(JSON.stringify({inputs:[]}),{headers:{'Content-Type':'application/json'}})):url==='/api/speech/transcribe'?(()=>{window.__testTranscriptionCalls=(window.__testTranscriptionCalls||0)+1;return new Promise(resolve=>setTimeout(()=>resolve(new Response(JSON.stringify({text:'disc four gate from two marks to two and a half marks'}),{headers:{'Content-Type':'application/json'}})),400));})():realFetch(url,options);
const realMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await realMedia(options);window.__testStream=stream;return stream;};
const realDevices=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=()=>window.__testStream?.getTracks().some(track=>track.readyState==='live')?realDevices():Promise.resolve([]);`});
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://127.0.0.1:8770'});await until('!!document.getElementById("voice-apply")');await new Promise(r=>setTimeout(r,250));
await ev('localStorage.removeItem("disc-studio-voice-v1");localStorage.removeItem("disc-studio-v1")');
await send('Page.reload',{ignoreCache:true});await new Promise(r=>setTimeout(r,850));await until('!!document.getElementById("voice-apply")');
if(await ev('!!document.querySelector("video, input[type=file]:not(#lock-file), a[href*=camera], a[href*=diagnostics]")'))throw Error('Camera/media controls remain');
for(const path of ['/camera.html','/diagnostics.html','/api/connection','/api/stream']){if((await fetch('http://127.0.0.1:8770'+path)).status!==404)throw Error('Retired route still served: '+path);}
if(await ev('document.getElementById("mic-input").options.length')!==1)throw Error('Expected privacy-limited initial list');
const before=await ev('document.getElementById("scene").toDataURL()');
await ev(`document.getElementById('voice-transcript').value='disc 2 2.5 marks until 3.5';document.getElementById('voice-apply').click()`);
await until('document.querySelector(".gate-card")?.textContent.includes("2.5–3.5 marks")');await new Promise(r=>setTimeout(r,150));
if(await ev('document.getElementById("scene").toDataURL()')===before)throw Error('Hypothesis did not update geometry');
await ev(`document.getElementById('voice-transcript').value='disc 2 maybe 9';document.getElementById('voice-apply').click()`);
if(!(await ev('document.querySelector(".gate-card").textContent.includes("2.5–3.5")')))throw Error('Ambiguous speech changed hypothesis');
await ev('document.getElementById("voice-start").click()');
await until('!!window.__testCapture?.port.onmessage');
if(await ev('document.getElementById("voice-start").textContent')!=='Stop listening')throw Error('Start did not become Stop');
await until('document.getElementById("mic-input").options.length>1');
await ev(`for(let i=0;i<20;i++)window.__testCapture.port.onmessage({data:new Float32Array(1024).fill(.05)});for(let i=0;i<5;i++)window.__testCapture.port.onmessage({data:new Float32Array(1024)});`);
if(await ev('document.querySelectorAll(".gate-card").length')!==1)throw Error('Incomplete utterance committed before silence');
if(await ev('document.getElementById("voice-phase").dataset.phase')!=='hearing')throw Error('Hearing state not visible');
await ev(`for(let i=0;i<7;i++)window.__testCapture.port.onmessage({data:new Float32Array(1024)});`);
await until('document.getElementById("voice-phase").dataset.phase==="transcribing"');
await ev(`for(let i=0;i<20;i++)window.__testCapture.port.onmessage({data:new Float32Array(1024).fill(.05)});for(let i=0;i<12;i++)window.__testCapture.port.onmessage({data:new Float32Array(1024)});`);
await until('document.querySelectorAll(".gate-card").length===2');
await until('document.getElementById("voice-phase").dataset.phase==="listening"');
if(await ev('window.__testTranscriptionCalls')!==1)throw Error('Repeat spoken while transcribing was queued');
if(!(await ev('[...document.querySelectorAll(".gate-card")].some(card=>card.textContent.includes("Disc 4 · 2–2.5 marks"))')))throw Error('Spoken half did not register');
await ev(`document.getElementById('voice-transcript').value='disc 4 gate from 2 to 2.5';document.getElementById('voice-apply').click()`);
await new Promise(r=>setTimeout(r,250));
if(await ev('JSON.parse(localStorage.getItem("disc-studio-voice-v1")).events.length')!==2)throw Error('Canonical repeat created duplicate event');
if(!(await ev('document.getElementById("command-status").textContent.includes("no duplicate")')))throw Error('Duplicate acknowledgement missing');

await ev('document.getElementById("voice-start").click();document.getElementById("voice-undo").click()');
await until('document.querySelectorAll(".gate-card").length===1');
if(await ev('window.__testStream?.getTracks().some(track=>track.readyState!=="ended")'))throw Error('Stop left microphone open');
await ev('document.querySelector(".gate-card button").click()');await until('!document.querySelector(".gate-card")');
await ev('document.getElementById("voice-undo").click()');await until('!!document.querySelector(".gate-card")');
await send('Page.reload',{ignoreCache:true});await new Promise(r=>setTimeout(r,850));await until('!!document.querySelector(".gate-card")');
const saved=await ev('JSON.parse(localStorage.getItem("disc-studio-voice-v1"))');
if(saved.events.length!==1||saved.events[0].degreesPerUnit!==45)throw Error('Autosave lost click mapping');
// Render the expected orientation independently; an upward drag must increase
// pitch so the front surface follows the pointer vertically.
const box=await ev('(()=>{const b=document.getElementById("scene").getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()');
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x,y:box.y-60,button:'left',buttons:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y-60,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,150));
const followsPointer=await ev(`(async()=>{const {drawDiscScene}=await import('./scene3d.mjs');const {stateAt}=await import('./model.mjs');const {gateHypothesesAt,gateAlignmentDegrees}=await import('./voice-commands.mjs');const s=JSON.parse(localStorage.getItem('disc-studio-voice-v1')),state=stateAt([],0,s.config);state.gateHypotheses=gateHypothesesAt(s.events,Infinity,s.config.discCount);state.pickAngleDeg=gateAlignmentDegrees(state.gateHypotheses[1],s.config.sidebarAngleDeg);const live=document.getElementById('scene'),c=document.createElement('canvas');c.width=live.width;c.height=live.height;drawDiscScene(c.getContext('2d'),c.width,c.height,s.config,state,{yaw:-.85,pitch:.38+.48,zoom:1,fitToViewport:true,exploded:true,axialScale:2,showSidebar:true,illustrativeNotches:true,showHousing:true,showDriveTabs:true,alignHypotheses:true,fromTop:true,showPick:true,pickScale:3,rectangularKeyway:true,voiceOnly:true,lightTheme:true,sketch:true});return c.toDataURL()===live.toDataURL();})()`);
if(!followsPointer)throw Error('Upward drag did not render expected geometry-following orientation');
await ev(`document.getElementById('disc-count').value=2;document.getElementById('disc-count').dispatchEvent(new Event('change'))`);
await until('document.getElementById("alignment-status").textContent.includes("sidebar lowered")');
await ev('document.querySelector(".gate-card button").click()');
await until('document.getElementById("alignment-status").textContent.includes("bar stays raised")');
if(await ev('document.getElementById("voice-start").textContent')!=='Start listening')throw Error('Voice button did not reset');
await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(shot=>fs.writeFile('/tmp/disc-voice-simple.png',Buffer.from(shot.data,'base64')));
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,200));if(await ev('document.documentElement.scrollWidth>innerWidth+1'))throw Error('Mobile overflow');
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
if(errors.length)throw Error(JSON.stringify(errors));console.log('Passed: discs/voice only, retired camera routes, typed commands, permission-limited microphone selection, local microphone lifecycle and simulated utterance transcription, invalid-command rejection, clear/undo, autosave/reload, 45° per mark, upward drag direction, midpoint alignment and complete-stack sidebar drop, mobile layout. Physical microphone recognition not tested; local worker speech decoding is checked separately.');ws.close();
