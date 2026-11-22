import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {encodeWav} from './local-speech.mjs';
const origin='https://disc-retainer.example';
const voice=()=>encodeWav([Float32Array.from({length:16000},(_,i)=>Math.sin(i/10)*.05)]);
async function fixture(){
 const calls=[],env={ASSETS:{fetch:async()=>new Response('asset')},AI:{run:async(model,input)=>{calls.push({model,input});return {text:' disc four gate from two to two and a half '};}},SPEECH_LIMITER:{limit:async()=>({success:true})},GLOBAL_SPEECH_LIMITER:{limit:async()=>({success:true})}};
 const response=await worker.fetch(new Request(origin+'/api/speech/session'),env),session=await response.json();
 const headers={'Content-Type':'audio/wav',Authorization:`Bearer ${session.token}`,Cookie:response.headers.get('Set-Cookie').split(';')[0],Origin:origin,'CF-Connecting-IP':'192.0.2.1'};
 const post=(body=voice(),extra={})=>worker.fetch(new Request(origin+'/api/speech/transcribe',{method:'POST',headers:{...headers,...extra},body}),env);
 return {env,calls,headers,post};
}
test('hosted session describes Cloudflare and restricts its cookie; native input is unavailable',async()=>{
 const {env}=await fixture();const result=await worker.fetch(new Request(origin+'/api/speech/session'),env);
 assert.equal((await result.json()).engine,'cloudflare-whisper');assert.match(result.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict/);assert.match(result.headers.get('Set-Cookie'),/Secure/);
 const inputs=await worker.fetch(new Request(origin+'/api/speech/inputs'),env);assert.deepEqual((await inputs.json()).inputs,[]);
 const retired=await worker.fetch(new Request(origin+'/api/speech/native/start',{method:'POST'}),env);assert.equal(retired.status,404);
});
test('hosted transcription sends bounded mono WAV audio to Whisper and returns a trimmed command',async()=>{
 const {calls,post}=await fixture(),audio=voice(),response=await post(audio);
 assert.equal(response.status,200);assert.equal((await response.json()).text,'disc four gate from two to two and a half');assert.equal(calls.length,1);
 assert.equal(calls[0].model,'@cf/openai/whisper-large-v3-turbo');assert.equal(calls[0].input.language,'en');assert.equal(calls[0].input.vad_filter,true);
 assert.deepEqual(Buffer.from(calls[0].input.audio,'base64'),Buffer.from(audio));
});
test('cross-site, missing-session, malformed, wrong-format and oversized audio requests never invoke AI',async()=>{
 const {calls,post}=await fixture();
 assert.equal((await post(voice(),{Origin:'https://other.example'})).status,403);
 assert.equal((await post(voice(),{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await post(voice(),{Cookie:''})).status,401);
 assert.equal((await post(voice(),{Authorization:'Bearer wrong'})).status,401);
 assert.equal((await post(voice(),{'Content-Type':'application/json'})).status,415);
 assert.equal((await post(new Uint8Array(60))).status,400);
 assert.equal((await post(new Uint8Array(512045))).status,413);
 const wrong=voice();new DataView(wrong).setUint32(24,48000,true);assert.equal((await post(wrong)).status,400);
 assert.equal(calls.length,0);
});
test('silence avoids AI usage and rate limits protect non-silent requests',async()=>{
 const {env,calls,post}=await fixture();assert.equal((await(await post(encodeWav([new Float32Array(1600)]))).json()).text,'');assert.equal(calls.length,0);
 env.SPEECH_LIMITER.limit=async()=>({success:false});const limited=await post();assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');assert.equal(calls.length,0);
});
test('missing bindings and provider failures return useful errors without exposing request data',async()=>{
 const {env,post}=await fixture();env.AI=null;assert.equal((await post()).status,503);
 env.AI={run:async()=>({})};assert.equal((await post()).status,502);
});
test('static requests use the asset binding and unknown API routes do not fall back to the app',async()=>{
 const {env}=await fixture();assert.equal(await(await worker.fetch(new Request(origin+'/'),env)).text(),'asset');assert.equal((await worker.fetch(new Request(origin+'/api/nope'),env)).status,404);
});
