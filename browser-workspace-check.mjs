import fs from 'node:fs/promises';
const target=await(await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json();const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p?.reject(Error(msg.error.message)):p?.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(msg.params));else if(msg.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});};
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<60;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out: '+expression+' status '+await ev('document.getElementById("voice-status").textContent'));}
async function file(selector,path){const doc=await send('DOM.getDocument');const node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[path]});}
await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await send('Page.navigate',{url:process.env.DISC_RETAINER_URL||'http://127.0.0.1:8770'});await until('document.getElementById("touch-disc")?.options.length>=2');
const keys=['disc-studio-voice-v1','disc-studio-v1','disc-studio-locks-v1','disc-studio-panels-v1'];
const saved=await ev(`Object.fromEntries(${JSON.stringify(keys)}.map(key=>[key,localStorage.getItem(key)]))`);
try{
 await ev(`${JSON.stringify(keys)}.forEach(key=>localStorage.removeItem(key))`);await send('Page.reload',{ignoreCache:true});await until('document.getElementById("touch-disc")?.options.length===8');
 for(const text of ['disc four gate from 2 to 2.5','disc two false gate at 3','disc two gate from 1 to 1.5','disc three gate from 4 to 4.5','disc five gate at 1','disc six gate at 2','disc seven gate at 3','disc eight gate at 4']){
  await ev(`document.getElementById('voice-transcript').value=${JSON.stringify(text)};document.getElementById('voice-apply').click()`);
 }
 const steps=await ev('[...document.querySelectorAll("#pick-order li")].map(e=>e.textContent)');
 if(!steps[1].includes('Disc 4')||!steps[2].includes('false')||!steps[3].includes('Disc 2'))throw Error('Pick order did not preserve separate false-gate steps: '+JSON.stringify(steps));
 for(const [width,height] of [[320,568],[390,844],[844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await ev('document.querySelector(".voice-panel").scrollIntoView({block:"start",behavior:"instant"})');await new Promise(r=>setTimeout(r,350));
  const layout=await ev(`(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,visible:['scene','voice-start','pick-order'].every(id=>{const r=rect(id);return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),canvasHeight:rect('scene').height,workspace:document.querySelector('.model').getBoundingClientRect().toJSON()};})()`);
  if(layout.overflow||!layout.visible||layout.canvasHeight<110)throw Error('Shared workspace failed at '+width+'x'+height+': '+JSON.stringify(layout));
  await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(shot=>fs.writeFile('/tmp/disc-workspace-'+width+'.png',Buffer.from(shot.data,'base64')));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await ev('document.getElementById("touch-start").scrollIntoView({block:"center",behavior:"instant"})');await new Promise(r=>setTimeout(r,300));
 if(!await ev(`(()=>{const e=document.getElementById('touch-start'),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;})()`))throw Error('Sticky workspace obscures manual input');
 await ev('document.querySelector(".model-details").open=true');
 if(await ev('getComputedStyle(document.querySelector(".model")).position')==='sticky')throw Error('Expanded model details trap the screen');
 await ev('document.querySelector(".model-details").open=false');
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log('Passed shared model/listening/order visibility at 320x568, 390x844, 844x390; ordered false-gate steps; accessible manual fields; expandable details.');
}finally{
 await ev(`Object.entries(${JSON.stringify(saved)}).forEach(([key,value])=>value===null?localStorage.removeItem(key):localStorage.setItem(key,value))`);ws.close();
}
