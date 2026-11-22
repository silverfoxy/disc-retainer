import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{SpeechBudget,SPEECH_CAPS,SPEECH_CONTEXT} from './worker.mjs';
import {encodeWav} from './local-speech.mjs';
const origin='https://disc-retainer.example';
const voice=()=>encodeWav([Float32Array.from({length:16000},(_,i)=>Math.sin(i/10)*.05)]);
async function fixture(){
 const calls=[],env={SPEECH_ENABLED:'true',SPEECH_BUDGET:{idFromName:()=> 'global',get:()=>({fetch:async()=>Response.json({allowed:true})})},ASSETS:{fetch:async()=>new Response('asset')},AI:{run:async(model,input)=>{calls.push({model,input});return {text:' disc four gate from two to two and a half '};}},SPEECH_LIMITER:{limit:async()=>({success:true})},GLOBAL_SPEECH_LIMITER:{limit:async()=>({success:true})}};
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
 assert.equal(calls[0].input.initial_prompt,SPEECH_CONTEXT);assert.match(SPEECH_CONTEXT,/false gate/);assert.match(SPEECH_CONTEXT,/Reset all discs/);assert.equal(calls[0].input.condition_on_previous_text,false);
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
function budgetFixture(initial){
 let saved=initial,tail=Promise.resolve();
 const storage={transaction(fn){const pending=tail.then(()=>fn({get:async()=>structuredClone(saved),put:async(key,value)=>{saved=structuredClone(value);}}));tail=pending.catch(()=>{});return pending;}};
 const budget=new SpeechBudget({storage});
 return {storage,read:()=>saved,reserve:(seconds=16)=>budget.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({seconds})}))};
}
function currentUsage(extra={}){const day=new Date().toISOString().slice(0,10);return {day,month:day.slice(0,7),dailySeconds:0,dailyRequests:0,monthlySeconds:0,monthlyRequests:0,...extra};}
test('global budget admits the exact daily cap then refuses further reservations across object restarts',async()=>{
 const f=budgetFixture(currentUsage({dailySeconds:1784}));assert.equal((await f.reserve()).status,200);assert.equal(f.read().dailySeconds,1800);
 const restarted=new SpeechBudget({storage:f.storage});const denied=await restarted.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({seconds:1})}));
 assert.equal(denied.status,429);assert.match((await denied.json()).error,/daily/);assert.ok(Number(denied.headers.get('Retry-After'))>0);assert.equal(f.read().monthlyRequests,1);
});
test('monthly audio and daily/monthly request caps block inference reservations',async()=>{
 for(const extra of [{monthlySeconds:18000},{dailyRequests:300},{monthlyRequests:3000}]){
  const f=budgetFixture(currentUsage(extra));assert.equal((await f.reserve(1)).status,429);assert.deepEqual(f.read(),currentUsage(extra));
 }
});
test('UTC day reset preserves monthly use, and month reset clears both periods',async()=>{
 const daily=budgetFixture(currentUsage({day:'2000-01-01',dailySeconds:1800,dailyRequests:300,monthlySeconds:100}));assert.equal((await daily.reserve()).status,200);assert.equal(daily.read().dailySeconds,16);assert.equal(daily.read().monthlySeconds,116);
 const monthly=budgetFixture({...currentUsage({dailySeconds:1800,monthlySeconds:18000}),day:'2000-01-01',month:'2000-01'});assert.equal((await monthly.reserve()).status,200);assert.equal(monthly.read().monthlySeconds,16);
});
test('concurrent budget reservations cannot exceed the shared allowance',async()=>{
 const f=budgetFixture(currentUsage({dailySeconds:1790}));const results=await Promise.all(Array.from({length:10},()=>f.reserve(4)));
 assert.equal(results.filter(r=>r.status===200).length,2);assert.equal(f.read().dailySeconds,1798);
});
test('budget and kill switch fail closed before any model call',async()=>{
 const {env,calls,post}=await fixture();env.SPEECH_ENABLED='false';assert.equal((await post()).status,503);env.SPEECH_ENABLED='true';
 env.SPEECH_BUDGET=undefined;assert.equal((await post()).status,503);
 env.SPEECH_BUDGET={idFromName:()=> 'global',get:()=>({fetch:async()=>{throw Error('offline');}})};assert.equal((await post()).status,503);
 env.SPEECH_BUDGET.get=()=>({fetch:async()=>Response.json({error:'Allowance used up.'},{status:429})});assert.equal((await post()).status,429);assert.equal(calls.length,0);
});
test('failed provider attempts consume their reservation and silence consumes none',async()=>{
 const {env,post}=await fixture();let reserved=0;env.SPEECH_BUDGET.get=()=>({fetch:async()=>{reserved++;return Response.json({allowed:true});}});
 env.AI.run=async()=>({});assert.equal((await post()).status,502);assert.equal(reserved,1);
 await post(encodeWav([new Float32Array(1600)]));assert.equal(reserved,1);
});
