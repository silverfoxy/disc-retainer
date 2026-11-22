import fs from 'node:fs/promises';
const target=await(await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json();const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p?.reject(Error(msg.error.message)):p?.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(msg.params));else if(msg.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});};
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<60;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out: '+expression+' status '+await ev('document.getElementById("voice-status").textContent'));}
async function file(selector,path){const doc=await send('DOM.getDocument');const node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[path]});}
await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
const keys=['disc-studio-voice-v1','disc-studio-v1','disc-studio-locks-v1','disc-studio-panels-v1'];
await send('Page.navigate',{url:'http://127.0.0.1:8770'});await until('document.getElementById("touch-disc")?.options.length>0');
const previous=await ev(`Object.fromEntries(${JSON.stringify(keys)}.map(key=>[key,localStorage.getItem(key)]))`);
await ev(`${JSON.stringify(keys)}.forEach(key=>localStorage.removeItem(key))`);
await send('Page.reload',{ignoreCache:true});await until('document.getElementById("touch-disc")?.options.length>0');
await ev('if(document.getElementById("lock-content").hidden)document.getElementById("lock-toggle").click()');
async function command(text){await ev(`document.getElementById("voice-transcript").value=${JSON.stringify(text)};document.getElementById("voice-apply").click()`);}
async function click(id){await ev(`document.getElementById(${JSON.stringify(id)}).click()`);}
async function value(id,text){await ev(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(text)}`);}
const state=()=>ev('JSON.parse(localStorage.getItem("disc-studio-voice-v1"))');
await command('disc three gate from 2.5 to 3.5');
await command('disc three false gate at 1');
await ev('document.getElementById("touch-disc").focus()');
async function key(key,code,number,text){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:number,...(text?{text}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:number});}
await key('f','KeyF',70,'f');
if(!(await ev('document.getElementById("touch-kind").checked&&document.getElementById("touch-kind-name").textContent==="False gate"')))throw Error('F did not select false gate');
await key(' ','Space',32,' ');
if(await ev('document.activeElement.id')!=='touch-start')throw Error('Space did not advance to start');
await key('ArrowRight','ArrowRight',39);
await key(' ','Space',32,' ');
if(await ev('document.activeElement.id')!=='touch-end')throw Error('Space did not advance to end');
await key('ArrowRight','ArrowRight',39);
await key('ArrowLeft','ArrowLeft',37);
await key(' ','Space',32,' ');
if(await ev('document.activeElement.id')!=='touch-save')throw Error('Space did not advance to save');
await ev('document.getElementById("touch-kind").focus()');
await key('t','KeyT',84,'t');
if(!(await ev('!document.getElementById("touch-kind").checked&&document.getElementById("touch-kind-name").textContent==="True gate"')))throw Error('T did not select true gate');
await key('f','KeyF',70,'f');
// Shortcuts must not consume normal text in names or transcripts.
await ev('document.getElementById("lock-name").focus()');
await key('t','KeyT',84,'t');
if(!(await ev('document.getElementById("touch-kind").checked&&document.getElementById("lock-name").value==="t"')))throw Error('Shortcut interfered with name typing');

await click('touch-keyboard');
if(await ev('document.activeElement.id')!=='touch-start')throw Error('Keyboard button did not focus manual input');
await ev('document.activeElement.blur()');
const keyboardBefore=await ev('({scroll:window.scrollY,value:Number(document.getElementById("touch-start").value)})');
await key('ArrowUp','ArrowUp',38);
await new Promise(resolve=>setTimeout(resolve,150));
const keyboardAfter=await ev('({scroll:window.scrollY,value:Number(document.getElementById("touch-start").value)})');
if(keyboardAfter.scroll!==keyboardBefore.scroll||keyboardAfter.value!==keyboardBefore.value+.5)throw Error('Background arrow scrolled instead of adjusting manual input');
await key('ArrowDown','ArrowDown',40);
if(await ev('Number(document.getElementById("touch-start").value)')!==keyboardBefore.value)throw Error('Down arrow failed to reverse adjustment');
await value('touch-start','4.5');await value('touch-end','4.5');await click('touch-save');
await until('document.querySelector(".false-gate-card")?.textContent.includes("4.5–4.5")');
if((await state()).events.filter(event=>event.type==='false_gate_hypothesis').length!==2)throw Error('False gates did not accumulate');
await value('lock-name','Alpha lock');await click('lock-save');
await until('JSON.parse(localStorage.getItem("disc-studio-locks-v1")).locks.length===1');
await fs.mkdir('/tmp/disc-lock-exports',{recursive:true});await fs.rm('/tmp/disc-lock-exports/Alpha-lock.disc-lock.json',{force:true});
await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:'/tmp/disc-lock-exports'});
await click('lock-export');
let exported;for(let i=0;i<60;i++){try{exported=JSON.parse(await fs.readFile('/tmp/disc-lock-exports/Alpha-lock.disc-lock.json','utf8'));break;}catch{}await new Promise(r=>setTimeout(r,100));}
if(!exported||exported.title!=='Alpha lock'||exported.events.length!==3||exported.config.discCount!==8)throw Error('Downloaded notebook did not preserve name/history/count');
await fs.rm('/tmp/disc-lock-exports/Alpha-lock-gate-table.csv',{force:true});await click('lock-export-table');
let table;for(let i=0;i<60;i++){try{table=await fs.readFile('/tmp/disc-lock-exports/Alpha-lock-gate-table.csv','utf8');break;}catch{}await new Promise(r=>setTimeout(r,100));}
if(!table?.includes('"Step","Disc","True gate","False gate","Action"')||!table.includes('"2","3","2.5–3.5 marks",""')||!table.includes('"3","3","","1 marks"')||!table.includes('"4","3","","4.5 marks"')||!table.includes('"1","1","0 marks (assumed)"'))throw Error('Downloaded gate table did not preserve recorded order and gate locations');
await click('lock-new');
if((await state()).events.length)throw Error('New lock retained old observations');
await value('lock-name','Beta lock');await value('disc-count','6');await ev('document.getElementById("disc-count").dispatchEvent(new Event("change"))');
await command('disc two false gate at 3');await click('lock-save');
const alphaId=await ev('JSON.parse(localStorage.getItem("disc-studio-locks-v1")).locks.find(lock=>lock.name==="Alpha lock").id');
await value('lock-list',alphaId);await click('lock-load');
if((await state()).events.length!==3||(await state()).config.discCount!==8)throw Error('Opening another lock lost its independent observations/count');
await command('disc five gate at 2');
await send('Page.reload',{ignoreCache:true});await until('document.getElementById("lock-name")?.value==="Alpha lock"');
if((await state()).events.length!==4)throw Error('Named lock observation did not autosave');
await file('#lock-file','/tmp/disc-lock-exports/Alpha-lock.disc-lock.json');
await until('JSON.parse(localStorage.getItem("disc-studio-locks-v1")).locks.length===3');
if((await state()).events.length!==3)throw Error('Import did not restore exported snapshot');
const library=await ev('JSON.parse(localStorage.getItem("disc-studio-locks-v1"))');
if(library.locks.filter(lock=>lock.name==='Alpha lock').length!==2||!library.locks.some(lock=>lock.name==='Beta lock'))throw Error('Import replaced an existing notebook');
await command('clear false gates disc three');
if(await ev('!!document.querySelector(".false-gate-card")'))throw Error('False-gate clear failed');
if(!(await ev('document.querySelector(".gate-card")?.textContent.includes("2.5–3.5")')))throw Error('False-gate clear removed main gate');
await click('voice-undo');await until('!!document.querySelector(".false-gate-card")');
await command('reset disc three');await until('document.querySelectorAll(".gate-card").length===0');
await click('voice-undo');await until('document.querySelectorAll(".gate-card").length===2');
await fs.writeFile('/tmp/disc-invalid-notebook.json','{"version":1,"events":"invalid"}');
const before=JSON.stringify(await state());await file('#lock-file','/tmp/disc-invalid-notebook.json');
await until('document.getElementById("lock-status").textContent.includes("Import failed")');
if(JSON.stringify(await state())!==before)throw Error('Invalid import changed current notebook');
await ev(`Object.entries(${JSON.stringify(previous)}).forEach(([key,value])=>value===null?localStorage.removeItem(key):localStorage.setItem(key,value))`);
if(errors.length)throw Error(JSON.stringify(errors));
console.log('Passed named notebooks, independent disc counts, autosave/reload, real JSON and gate-table CSV downloads/import, duplicate-name preservation, rejected invalid import, multiple false gates, clear/reset/Undo.');ws.close();
