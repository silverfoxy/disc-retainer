import fs from 'node:fs/promises';
const target=await(await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json();const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p?.reject(Error(msg.error.message)):p?.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(msg.params));else if(msg.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});};
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<60;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out: '+expression+' status '+await ev('document.getElementById("voice-status").textContent'));}
async function file(selector,path){const doc=await send('DOM.getDocument');const node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[path]});}
await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
const keys=['disc-studio-voice-v1','disc-studio-v1','disc-studio-locks-v1','disc-studio-panels-v1'];
await send('Page.navigate',{url:'http://127.0.0.1:8770'});await until('!!document.getElementById("picking-play")');
const saved=await ev(`Object.fromEntries(${JSON.stringify(keys)}.map(key=>[key,localStorage.getItem(key)]))`);
await ev(`${JSON.stringify(keys)}.forEach(key=>localStorage.removeItem(key))`);await send('Page.reload',{ignoreCache:true});await until('!!document.getElementById("picking-play")');
async function click(id){await ev(`document.getElementById(${JSON.stringify(id)}).click()`);}
async function command(text){await ev(`document.getElementById("voice-transcript").value=${JSON.stringify(text)};document.getElementById("voice-apply").click()`);}
await ev('document.getElementById("disc-count").value="4";document.getElementById("disc-count").dispatchEvent(new Event("change"))');
await command('disc four gate from 2 to 2.5');await command('disc two gate from 1 to 1.5');
await command('disc three false gate at 3');
if(!(await ev('document.getElementById("picking-play").disabled')))throw Error('False gate incorrectly enabled picking playback');
await command('disc three gate from 3 to 3.5');
await command('disc four gate from 2.5 to 3');
await ev('document.getElementById("touch-disc").value="1";document.getElementById("touch-disc").dispatchEvent(new Event("change"));document.getElementById("touch-start").value="5";document.getElementById("touch-end").value="5.5";document.getElementById("touch-save").click()');
if(!(await ev('[...document.querySelectorAll(".gate-card")].some(card=>card.dataset.disc==="1"&&card.textContent.includes("5–5.5"))')))throw Error('Manual controls could not save disc 1 gate');

if(!(await ev('document.getElementById("picking-status").textContent.includes("disc 4 → disc 2 → disc 3 → disc 1")')))throw Error('Playback did not preserve entry order after an update');
const observations=await ev('localStorage.getItem("disc-studio-voice-v1")');
await send('Page.reload',{ignoreCache:true});await until('!document.getElementById("picking-play")?.disabled');
if(!(await ev('document.getElementById("picking-status").textContent.includes("disc 4 → disc 2 → disc 3 → disc 1")')))throw Error('Entry order lost on reload');
await click('picking-play');
const turns=[],phases=[];let complete=false;
for(let i=0;i<160;i++){
 const status=await ev('({phase:document.getElementById("picking-status").dataset.phase,disc:Number(document.getElementById("picking-status").dataset.disc)})');
 if(phases.at(-1)!==status.phase)phases.push(status.phase);
 if(['turn','counterturn'].includes(status.phase)&&turns.at(-1)!==status.disc)turns.push(status.disc);
 if(status.phase==='complete'){complete=true;break;}
 await new Promise(resolve=>setTimeout(resolve,80));
}
if(!complete||JSON.stringify(turns)!=='[4,2,3,1]')throw Error('Incorrect picking playback '+JSON.stringify({phases,turns}));
if(phases.indexOf('sidebar')<phases.lastIndexOf('turn')||phases.indexOf('unlock')<phases.indexOf('sidebar'))throw Error('Core turned before the sidebar seated');
if(await ev('localStorage.getItem("disc-studio-voice-v1")')!==observations)throw Error('View animation changed recorded observations');
await click('picking-play');await until('document.getElementById("picking-status").dataset.phase==="reset"');
await click('picking-stop');await until('document.getElementById("picking-stop").disabled&&!document.getElementById("picking-play").disabled');
await click('picking-play');await command('disc two gate from 2 to 2.5');
await until('document.getElementById("picking-stop").disabled');
await command('reset disc one');
if(!(await ev('!document.getElementById("picking-play").disabled')))throw Error('Resetting disc 1 did not restore assumed gate readiness');
if(await ev('[...document.querySelectorAll(".gate-card")].some(card=>card.dataset.disc==="1")'))throw Error('Resetting disc 1 kept its old gate');
await command('reset disc two');
if(!(await ev('document.getElementById("picking-play").disabled')))throw Error('Reset did not disable playback');
await ev(`Object.entries(${JSON.stringify(saved)}).forEach(([key,value])=>value===null?localStorage.removeItem(key):localStorage.setItem(key,value))`);
if(errors.length)throw Error(JSON.stringify(errors));
console.log('Passed editable disc 1 via manual controls, counter-rotation playback and reload, disc-1 reset-to-default, full sequential animation, sidebar-before-core turn, unchanged observations, replay/stop/edit cancellation and false-gate readiness checks.');ws.close();
