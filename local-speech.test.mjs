import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWav,LocalSpeech} from './local-speech.mjs';
test('WAV encoding preserves mono 16 kHz audio with clipped PCM16 values',()=>{
 const wav=encodeWav([new Float32Array([-2,-.5,0,.5,2])]),v=new DataView(wav);
 assert.equal(new TextDecoder().decode(wav.slice(0,4)),'RIFF');
 assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint32(24,true),16000);assert.equal(v.getUint16(34,true),16);assert.equal(v.getUint32(40,true),10);
 assert.deepEqual(Array.from({length:5},(_,i)=>v.getInt16(44+i*2,true)),[-32767,-16383,0,16384,32767]);
});
function fixture(){
 const transcripts=[],statuses=[],speech=new LocalSpeech({onStatus:t=>statuses.push(t),onTranscript:t=>transcripts.push(t),onEnd:()=>{}});
 Object.assign(speech,{generation:1,preRoll:[],utterance:null,silence:0,voiced:0,samples:0});return {speech,transcripts,statuses};
}
const frames=(speech,count,value)=>{for(let i=0;i<count;i++)speech.accept(new Float32Array(1024).fill(value),1);};
test('silence does not invoke transcription; a completed voiced phrase invokes it once',async()=>{
 const {speech,transcripts}=fixture();let calls=0;speech.call=async(path,wav)=>{calls++;assert.ok(wav.byteLength>44);return {text:'disc two gate from two to three point five'};};
 frames(speech,20,0);assert.equal(calls,0);
 frames(speech,20,.05);frames(speech,5,0);assert.equal(calls,0);
 frames(speech,7,0);await speech.tail;
 assert.equal(calls,1);assert.equal(transcripts.length,1);
 frames(speech,20,0);assert.equal(calls,1);
});
test('stopping suppresses a transcription response already in flight',async()=>{
 const {speech,transcripts}=fixture();let resolve;speech.call=()=>new Promise(r=>resolve=r);
 frames(speech,20,.05);frames(speech,12,0);await new Promise(setImmediate);
 speech.stop();resolve({text:'disc three gate at four'});await speech.tail;
 assert.deepEqual(transcripts,[]);assert.equal(speech.pending,0);
});
test('a short click is discarded instead of being treated as a spoken command',()=>{
 const {speech}=fixture();speech.call=()=>{throw Error('Should not transcribe a click');};
 frames(speech,1,.2);frames(speech,12,0);assert.equal(speech.pending,0);
});
test('quiet speech above a steady quiet background reaches transcription',async()=>{
 const {speech,transcripts}=fixture();speech.call=async()=>({text:'disc two gate from two to three point five'});
 frames(speech,32,.0003);assert.equal(speech.pending,0);
 frames(speech,24,.003);frames(speech,12,.0003);await speech.tail;
 assert.equal(transcripts.length,1);assert.ok(speech.threshold<.003);
});

test('listening phases are explicit and capture pauses while a phrase is transcribing',async()=>{
 const {speech,transcripts,statuses}=fixture(),phases=[];speech.onState=phase=>phases.push(phase);let resolve,calls=0;
 speech.call=()=>{calls++;return new Promise(r=>resolve=r);};speech.setState('listening');
 frames(speech,20,.05);assert.equal(speech.phase,'hearing');frames(speech,12,0);assert.equal(speech.phase,'transcribing');
 await new Promise(setImmediate);
 // A repeated full utterance during inference must not enter another request.
 frames(speech,20,.05);frames(speech,12,0);assert.equal(speech.pending,1);assert.equal(calls,1);
 resolve({text:'disc four gate from two to two and a half'});await speech.tail;
 assert.deepEqual(phases,['listening','hearing','transcribing','listening']);assert.equal(transcripts.length,1);assert.equal(speech.utterance,null);assert.ok(statuses.at(-1).startsWith('Listening'));
});
test('quota errors stop microphone capture and retain the allowance explanation',async()=>{
 const {speech,statuses}=fixture();speech.running=true;let stopped=false;speech.stream={getTracks:()=>[{stop(){stopped=true;}}]};
 speech.call=async()=>{throw Object.assign(Error('Shared daily speech allowance used up.'),{status:429});};
 frames(speech,20,.05);frames(speech,12,0);await speech.tail;
 assert.equal(stopped,true);assert.equal(speech.running,false);assert.equal(speech.phase,'stopped');assert.match(statuses.at(-1),/allowance used up/);
});
