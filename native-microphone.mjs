import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {LocalSpeech} from './local-speech.mjs';
const exec=promisify(execFile);
export async function listNativeInputs(){
 const [sources,defaultSource]=await Promise.all([exec('pactl',['--format=json','list','sources'],{timeout:3000,maxBuffer:1000000}),exec('pactl',['get-default-source'],{timeout:3000})]);
 return JSON.parse(sources.stdout).filter(source=>!source.name.endsWith('.monitor')).map(source=>({id:source.name,label:source.description||source.name,isDefault:source.name===defaultSource.stdout.trim()}));
}
export class NativeMicrophone{
 constructor(speech){this.speech=speech;this.child=null;this.id=null;this.messages=[];this.sequence=0;this.timer=setInterval(()=>{if(this.child&&Date.now()-this.touched>10000)this.stop();},2000);this.timer.unref();}
 async start(sourceId,check=false){
  if(this.child)throw Error('A local microphone session is already active. Stop it first.');
  const source=(await listNativeInputs()).find(input=>input.id===sourceId);if(!source)throw Error('The selected local input is no longer available. Refresh microphones.');
  if(!check)await this.speech.request({command:'ready'});
  // Recheck after asynchronous preparation, before opening hardware.
  if(this.child)throw Error('A local microphone session is already active.');
  const id=randomUUID();this.id=id;this.messages=[];this.sequence=0;this.peak=0;this.level=0;this.touched=Date.now();this.phase='listening';this.status=`Listening locally · ${source.label}. Speak a command, then pause.`;this.label=source.label;
  const detector=new LocalSpeech({onState:phase=>{if(this.id!==id)return;this.phase=phase;if(phase==='transcribing')this.status='Transcribing locally. Please wait; microphone capture is paused.';else if(phase==='hearing')this.status='Hearing your command. Pause when finished.';else if(phase==='listening'&&/^(Transcribing|Hearing|Listening)/.test(this.status))this.status=`Listening locally · ${source.label}. Speak a command, then pause.`;},onStatus:text=>{if(this.id===id)this.status=text;},onTranscript:text=>{if(this.id===id){this.messages.push({sequence:++this.sequence,text});this.messages=this.messages.slice(-20);this.status=`Listening locally · ${source.label}. Speak a command, then pause.`;}},onEnd:()=>{}});
  Object.assign(detector,{generation:1,running:true,preRoll:[],utterance:null,silence:0,voiced:0,samples:0});
  detector.call=async(_,wav)=>this.speech.request({audio:Buffer.from(wav).toString('base64')});this.detector=detector;
  const child=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-f','pulse','-i',source.id,'-ac','2','-ar','16000','-f','s16le','pipe:1'],{stdio:['ignore','pipe','pipe']});this.child=child;
  let pending=Buffer.alloc(0),errorText='';
  child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-1000);});
  child.stdout.on('data',chunk=>{
   if(this.child!==child)return;
   pending=Buffer.concat([pending,chunk]);
   while(pending.length>=4096){const block=pending.subarray(0,4096);pending=pending.subarray(4096);const samples=new Float32Array(1024);let left=0,right=0;
    for(let i=0;i<samples.length;i++){const l=block.readInt16LE(i*4)/32768,r=block.readInt16LE(i*4+2)/32768;left+=l*l;right+=r*r;}
    const channel=left>=right?0:1;for(let i=0;i<samples.length;i++)samples[i]=block.readInt16LE(i*4+channel*2)/32768;
    this.channelLevels=[Math.sqrt(left/samples.length),Math.sqrt(right/samples.length)];this.level=this.channelLevels[channel];this.peak=Math.max(this.peak,this.level);if(!check)detector.accept(samples,1);
   }
  });
  const failed=()=>{if(this.child!==child)return;this.child=null;detector.stop();this.status=`Local microphone stopped: ${errorText.trim()||'audio device disconnected'}`;};child.on('error',failed);child.on('exit',failed);
  try{await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.stop(id);reject(Error('No audio arrived from the local input. Check the audio device.'));},6000);
   child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(Error(errorText.trim()||'Local input failed to open.'));});
  });}catch(error){this.stop(id);throw error;}
  return {session:id,label:source.label};
 }
 poll(id,after=0){if(id!==this.id)throw Error('Local microphone session expired. Start listening again.');this.touched=Date.now();return {running:!!this.child,phase:this.phase,status:this.status,label:this.label,level:this.level,peak:this.peak,threshold:this.detector?.threshold??.0008,speechActive:!!this.detector?.utterance,pending:this.detector?.pending??0,messages:this.messages.filter(message=>message.sequence>after)};}
 diagnostics(){return {running:!!this.child,phase:this.phase,label:this.label,level:this.level,peak:this.peak,channelLevels:this.channelLevels,threshold:this.detector?.threshold??.0008,speechActive:!!this.detector?.utterance,pending:this.detector?.pending??0,transcripts:this.sequence,status:this.status};}
 stop(id){if(id&&id!==this.id)return;const child=this.child;this.child=null;this.detector?.stop();child?.kill('SIGTERM');this.phase='stopped';this.status='Not listening.';}
 close(){this.stop();clearInterval(this.timer);}
}
