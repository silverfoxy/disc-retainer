export function encodeWav(chunks){
 const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0),bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes);
 const label=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
 label(0,'RIFF');view.setUint32(4,36+length*2,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,length*2,true);
 let index=44;for(const chunk of chunks)for(const sample of chunk){view.setInt16(index,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);index+=2;}
 return bytes;
}
export class LocalSpeech{
 constructor({onStatus,onTranscript,onEnd,onLevel=()=>{},onState=()=>{}}){Object.assign(this,{onStatus,onTranscript,onEnd,onLevel,onState});this.phase='stopped';this.noiseHistory=[];this.running=false;this.generation=0;this.pending=0;}
 reportStatus(text){this.lastStatus=text;this.onStatus(text);}
 setState(phase){if(this.phase===phase)return;this.phase=phase;this.onState(phase);}
 async start(deviceId=''){
  const generation=++this.generation;this.running=true;this.setState('preparing');this.reportStatus('Preparing local speech recognition…');
  try{
   const connection=await fetch('/api/speech/session');if(!connection.ok)throw Error('Local speech server unavailable.');this.token=(await connection.json()).token;
   if(deviceId.startsWith('native:')){await this.startNative(deviceId.slice(7),generation);return;}
   await this.call('/api/speech/ready',null);
   if(generation!==this.generation)return;
   const stream=await navigator.mediaDevices.getUserMedia({audio:deviceId?{deviceId:{exact:deviceId},echoCancellation:true,noiseSuppression:true}:{echoCancellation:true,noiseSuppression:true},video:false});
   if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}this.stream=stream;
   this.context=new AudioContext({sampleRate:16000});await this.context.resume();await this.context.audioWorklet.addModule('./speech-capture.mjs');
   if(generation!==this.generation)return;
   const source=this.context.createMediaStreamSource(stream),capture=new AudioWorkletNode(this.context,'speech-capture',{channelCount:1,channelCountMode:'explicit',outputChannelCount:[1]}),mute=this.context.createGain();mute.gain.value=0;source.connect(capture).connect(mute).connect(this.context.destination);
   this.preRoll=[];this.utterance=null;this.silence=0;this.voiced=0;this.samples=0;this.noiseHistory=[];this.deviceName=stream.getAudioTracks()[0].label;
   capture.port.onmessage=event=>{if(generation===this.generation)this.accept(event.data,generation);};
   this.setState('listening');this.reportStatus(`Listening locally · ${this.deviceName||'microphone'}. Say a complete command, then pause.`);
  }catch(error){if(generation!==this.generation)return;this.stop();this.reportStatus(`Local speech unavailable (${error.name}): ${error.message}`);}
 }
 async startNative(source,generation){
  const result=await nativeRequest(this.token,'/api/speech/native/start',{source});
  if(generation!==this.generation){await nativeRequest(this.token,'/api/speech/native/stop',{session:result.session});return;}
  this.nativeSession=result.session;let after=0,busy=false;
  const poll=async()=>{
   if(busy||generation!==this.generation)return;busy=true;
   try{const status=await nativeRequest(this.token,`/api/speech/native/status?session=${encodeURIComponent(result.session)}&after=${after}`);
    if(generation!==this.generation)return;
    if(!status.running){this.stop();this.reportStatus(status.status);return;}
    this.setState(status.phase||(status.pending?'transcribing':status.speechActive?'hearing':'listening'));
    this.onLevel({rms:status.level,threshold:status.threshold,speechActive:status.speechActive,pending:status.pending});
    if(!status.messages.length)this.reportStatus(status.status);
    for(const message of status.messages){if(message.sequence<=after)continue;after=message.sequence;this.onTranscript(message.text);}
   }catch(error){if(generation===this.generation){this.stop();this.reportStatus(`Local microphone connection failed: ${error.message}`);}}
   finally{busy=false;}
  };
  await poll();if(generation===this.generation)this.nativeTimer=setInterval(poll,250);
 }
 accept(chunk,generation){
  const rms=Math.sqrt(chunk.reduce((sum,x)=>sum+x*x,0)/chunk.length);
  const sorted=[...this.noiseHistory].sort((a,b)=>a-b),noise=sorted.length?sorted[Math.floor(sorted.length*.2)]:.00025;
  this.threshold=Math.max(.0008,noise*3.5);const speech=rms>(this.utterance?this.threshold*.65:this.threshold);
  this.onLevel({rms,threshold:this.threshold,speechActive:this.pending?false:speech,pending:this.pending});
  // Capture is paused until this phrase has finished transcribing. Repeats
  // spoken during processing must not become queued duplicate commands.
  if(this.pending){this.preRoll=[];this.utterance=null;this.silence=0;return;}
  if(!this.utterance&&!speech){this.noiseHistory.push(rms);if(this.noiseHistory.length>64)this.noiseHistory.shift();}
  if(!this.utterance){this.preRoll.push(chunk);if(this.preRoll.length>5)this.preRoll.shift();if(!speech)return;this.utterance=[...this.preRoll];this.preRoll=[];this.samples=this.utterance.reduce((sum,c)=>sum+c.length,0);this.voiced=0;this.setState('hearing');}
  else{this.utterance.push(chunk);this.samples+=chunk.length;}
  this.silence=speech?0:this.silence+chunk.length;this.voiced+=speech?chunk.length:0;
  if(this.silence<11200&&this.samples<224000)return;
  const audio=this.utterance,voiced=this.voiced;this.utterance=null;this.preRoll=[];this.silence=0;
  if(voiced<3200){this.setState('listening');return;}
  this.pending++;this.setState('transcribing');this.reportStatus('Transcribing locally. Please wait; microphone capture is paused.');const prior=this.tail??Promise.resolve();
  this.tail=prior.catch(()=>{}).then(async()=>{
   if(generation!==this.generation)return;
   const response=await this.call('/api/speech/transcribe',encodeWav(audio));
   if(generation!==this.generation)return;
   if(response.text)this.onTranscript(response.text);else this.reportStatus('No clear speech recognized. Speak a complete command and pause.');
  }).catch(error=>{if(generation===this.generation)this.reportStatus(`Local transcription failed: ${error.message}`);}).finally(()=>{this.pending--;if(generation===this.generation&&!this.pending){this.setState('listening');if(this.lastStatus?.startsWith('Transcribing'))this.reportStatus('Listening locally. Ready for the next command.');}});
 }
 async call(path,audio){
  const response=await fetch(path,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':audio?'audio/wav':'application/json'},body:audio??'{}'});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Local recognition request failed.');return result;
 }
 stop(){clearInterval(this.nativeTimer);if(this.nativeSession){nativeRequest(this.token,'/api/speech/native/stop',{session:this.nativeSession},true).catch(()=>{});this.nativeSession=null;}this.running=false;this.setState('stopped');this.generation++;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;this.context?.close().catch(()=>{});this.context=null;this.onEnd();}
}

async function nativeRequest(token,path,body,keepalive=false){
 const response=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,keepalive});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Local input request failed.');return result;
}
export async function checkLocalMicrophone(source,onStatus){
 const {token}=await(await fetch('/api/speech/session')).json();let session;
 try{
  const result=await nativeRequest(token,'/api/speech/native/start',{source,check:true});session=result.session;let status;
  for(let i=0;i<25;i++){
   status=await nativeRequest(token,`/api/speech/native/status?session=${encodeURIComponent(session)}`);
   if(!status.running)throw Error(status.status);
   onStatus(`Testing ${status.label} directly: input level ${Math.min(100,Math.round(status.level*500))}% · speak now (${Math.ceil((25-i)/5)}s).`);
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  return status;
 }finally{if(session)await nativeRequest(token,'/api/speech/native/stop',{session}).catch(()=>{});}
}
