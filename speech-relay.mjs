import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export class SpeechRelay{
 constructor(){this.child=null;this.pending=null;this.sequence=0;}
 stop(){const child=this.child;this.child=null;child?.kill();if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Local speech worker stopped. Start listening again.'));this.pending=null;}}
 start(){
  if(this.child)return;
  const localPython=fileURLToPath(new URL('./.venv-speech/bin/python',import.meta.url)),legacyPython=fileURLToPath(new URL('../.venv-speech/bin/python',import.meta.url));
  const python=process.env.DISC_RETAINER_PYTHON||(existsSync(localPython)?localPython:existsSync(legacyPython)?legacyPython:'python3');
  const child=spawn(python,[fileURLToPath(new URL('./speech_worker.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});this.child=child;let buffer='';
  child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>100000){this.stop();return;}let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const response=JSON.parse(line),pending=this.pending;if(pending?.id===response.request_id){clearTimeout(pending.timer);this.pending=null;response.error?pending.reject(Error(response.error)):pending.resolve(response.result);}}catch{this.stop();}}});
  child.stderr.on('data',()=>{});
  const failed=()=>{if(this.child===child)this.stop();};child.on('exit',failed);child.on('error',failed);child.stdin.on('error',failed);
 }
 request(payload){
  if(this.pending)return Promise.reject(Error('Local recognizer is busy. Wait a moment and retry.'));
  this.start();return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>this.stop(),60000);this.pending={id,resolve,reject,timer};this.child.stdin.write(JSON.stringify({...payload,request_id:id})+'\n');});
 }
}
