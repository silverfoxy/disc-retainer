import fs from 'node:fs/promises';
const target=await(await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json();const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p?.reject(Error(msg.error.message)):p?.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(msg.params));else if(msg.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});};
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<60;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out: '+expression+' status '+await ev('document.getElementById("voice-status").textContent'));}
async function file(selector,path){const doc=await send('DOM.getDocument');const node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[path]});}
await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__wakeCalls=0;window.__wakeDeny=false;Object.defineProperty(navigator,'wakeLock',{value:{request:async()=>{window.__wakeCalls++;if(window.__wakeDeny)throw Error('Battery saver');const lock=new EventTarget();lock.release=async()=>lock.dispatchEvent(new Event('release'));window.__wakeSentinel=lock;return lock;}}});`});
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true});
await send('Page.navigate',{url:'http://127.0.0.1:8770'});await until('!!document.getElementById("touch-save")');
// This is the dedicated test browser; preserve its notebook across the check.
const saved=await ev('localStorage.getItem("disc-studio-voice-v1")');
const savedLibrary=await ev('localStorage.getItem("disc-studio-locks-v1")');
await ev('localStorage.removeItem("disc-studio-locks-v1")');
const savedPanels=await ev('localStorage.getItem("disc-studio-panels-v1")');
await ev('localStorage.removeItem("disc-studio-panels-v1")');
await ev('localStorage.removeItem("disc-studio-voice-v1");localStorage.removeItem("disc-studio-v1")');
await send('Page.reload',{ignoreCache:true});await until('document.getElementById("touch-disc")?.options.length===8');
async function tap(id){await ev(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:"center",behavior:"instant"})`);await new Promise(r=>setTimeout(r,200));const rect=await ev(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[rect]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
await tap('touch-disc-next');await until('document.getElementById("touch-disc").value==="3"');
for(let i=0;i<4;i++)await tap('touch-start-plus');
await tap('touch-end-plus');
if(await ev('document.querySelectorAll(".gate-card").length')!==0)throw Error('Draft unexpectedly saved');
await tap('touch-save');await until('document.querySelector(".gate-card")?.textContent.includes("Disc 3 · 2–2.5 marks")');
await tap('touch-reset');await until('document.querySelectorAll(".gate-card").length===0');
await tap('touch-undo');await until('document.querySelectorAll(".gate-card").length===1');
await tap('touch-disc-prev');await until('document.getElementById("touch-start").value==="0"');
await tap('touch-disc-next');await until('document.getElementById("touch-start").value==="2"');
await ev('document.getElementById("voice-transcript").value="disc four gate from 1.25 to 2.25";document.getElementById("voice-apply").click()');
await until('document.getElementById("touch-disc").value==="4"&&document.getElementById("touch-start").value==="1.25"');
await ev('document.getElementById("touch-end").value="0";document.getElementById("touch-save").click()');
if(!(await ev('document.getElementById("touch-status").textContent.includes("end at or above")')))throw Error('Invalid touch range accepted');
await ev('document.getElementById("disc-count").value="3";document.getElementById("disc-count").dispatchEvent(new Event("change"))');
await until('document.getElementById("touch-disc").value==="3"&&document.getElementById("touch-disc-next").disabled');
// Exercise keyboard selection, exact decimals, Tab focus, arrow steps and Enter.
await ev('document.getElementById("touch-disc").focus()');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'2',code:'Digit2',windowsVirtualKeyCode:50});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'2',code:'Digit2',windowsVirtualKeyCode:50});
await until('document.getElementById("touch-disc").value==="2"');
await ev('document.getElementById("touch-start").focus()');
await send('Input.insertText',{text:'1.25'});
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
if(!(await ev('document.activeElement.id==="touch-start-plus"&&document.activeElement.matches(":focus-visible")')))throw Error('Tab focus not visible');
await ev('document.getElementById("touch-end").focus()');
await send('Input.insertText',{text:'2.25'});
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
await until('document.getElementById("touch-end").value==="2.75"');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
await until('[...document.querySelectorAll(".gate-card")].some(card=>card.textContent.includes("Disc 2 · 1.25–2.75 marks"))');
await ev('document.activeElement.blur()');
const fullHeight=await ev('document.querySelector(".touch-panel").getBoundingClientRect().height');
await ev('document.getElementById("touch-start").value="1.5"');
await tap('touch-toggle');
await until('document.getElementById("touch-content").hidden&&document.getElementById("touch-toggle").getAttribute("aria-expanded")==="false"');
if(await ev('document.querySelector(".touch-panel").getBoundingClientRect().height')>=fullHeight-100)throw Error('Minimized manual panel did not free screen space');
await tap('touch-toggle');
if(await ev('document.getElementById("touch-start").value')!=='1.5')throw Error('Minimize lost unsaved draft');
await tap('touch-toggle');
// Use keyboard activation for the voice toggle, then verify saved panel preferences.
await ev('document.getElementById("voice-toggle").focus()');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
await until('document.getElementById("voice-content").hidden');
if(!(await ev('document.getElementById("voice-summary").checkVisibility()')))throw Error('Minimize hid compact voice status');
await send('Page.reload',{ignoreCache:true});
await until('document.getElementById("touch-content")?.hidden&&document.getElementById("voice-content")?.hidden');
await tap('touch-toggle');
await ev('document.getElementById("voice-toggle").click()');
await until('!document.getElementById("touch-content").hidden&&!document.getElementById("voice-content").hidden');
await until('document.getElementById("wake-status").textContent.includes("Screen stays awake")');
await ev('window.__wakeDeny=true;window.__wakeSentinel.release();document.dispatchEvent(new Event("pointerdown"))');
await until('document.getElementById("wake-status").textContent.includes("unavailable")');
await ev('window.__wakeDeny=false;document.dispatchEvent(new Event("visibilitychange"))');
await until('document.getElementById("wake-status").textContent.includes("Screen stays awake")');
if(await ev('window.__wakeCalls')!==3)throw Error('Wake lock retry did not run');
for(const width of [320,390,844]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
 await ev('document.getElementById("voice-start").scrollIntoView({block:"center"})');
 const accessible=await ev('(()=>{const b=document.getElementById("voice-start"),r=b.getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&r.left>=0&&r.right<=innerWidth&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()');
 if(!accessible)throw Error('Voice button obstructed at width '+width);
}
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await ev('window.scrollTo(0,0)');
if(await ev('getComputedStyle(document.querySelector(".touch-panel")).position')==='fixed')throw Error('Manual panel overlays the page');
if(await ev('document.querySelectorAll("#voice-stop,#mic-check,#mic-refresh").length'))throw Error('Redundant voice controls remain');
const layout=await ev(`(()=>{const panel=document.querySelector('.touch-panel').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,panelTop:panel.top,panelBottom:panel.bottom,height:innerHeight,background:getComputedStyle(document.body).backgroundColor,scheme:getComputedStyle(document.documentElement).colorScheme,targets:[...document.querySelectorAll('.touch-panel button,.touch-row input,.touch-row select')].every(el=>el.getBoundingClientRect().height>=48)};})()`);
if(layout.overflow||layout.panelBottom<=layout.panelTop||!layout.targets||layout.scheme!=='light')throw Error('Mobile layout failed '+JSON.stringify(layout));
await new Promise(r=>setTimeout(r,850));
await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(shot=>fs.writeFile('/tmp/disc-touch-mobile.png',Buffer.from(shot.data,'base64')));
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,250));
await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(shot=>fs.writeFile('/tmp/disc-touch-desktop.png',Buffer.from(shot.data,'base64')));
await ev(`localStorage.${saved===null?'removeItem("disc-studio-voice-v1")':`setItem("disc-studio-voice-v1",${JSON.stringify(saved)})`}`);
await ev(`localStorage.${savedPanels===null?'removeItem("disc-studio-panels-v1")':`setItem("disc-studio-panels-v1",${JSON.stringify(savedPanels)})`}`);
await ev(`localStorage.${savedLibrary===null?'removeItem("disc-studio-locks-v1")':`setItem("disc-studio-locks-v1",${JSON.stringify(savedLibrary)})`}`);
if(errors.length)throw Error(JSON.stringify(errors));
console.log('Passed touch taps, draft/save/reset/undo, per-disc ranges, voice synchronization, invalid ranges, count changes, keyboard digits/Tab/arrows/Enter, panel minimize/expand/persistence/draft retention, 48px targets, and mobile layout. Screenshots in /tmp/disc-touch-{mobile,desktop}.png');ws.close();
