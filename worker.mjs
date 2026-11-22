const MODEL='@cf/openai/whisper-large-v3-turbo';
const MAX_AUDIO_BYTES=512044;
// Whisper uses example transcript text as a vocabulary/spelling hint, not a grammar.
// Keep this fixed and independent of prior transcripts or saved lock observations.
export const SPEECH_CONTEXT='Disc detainer lock picking. Disc, gate, false gate, marks, tensioner, sidebar. Disc two gate from two to two and a half. Disc four gate from 2.5 to 3.5 marks. Disc three false gate at four. Reset disc two. Reset all discs. Reset all the discs, please. Clear disc two. Clear false gates disc three.';
const json=(value,status=200,extra={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const reject=(message,status)=>{throw json({error:message},status);};

async function boundedBody(request,limit){
 if(Number(request.headers.get('Content-Length'))>limit)reject('Speech payload is too large.',413);
 const chunks=[];let size=0;const reader=request.body?.getReader();
 if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();reject('Speech payload is too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function validateWav(bytes){
 if(bytes.length<44)throw Error('Expected mono 16 kHz PCM16 WAV audio.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),label=(at,length)=>String.fromCharCode(...bytes.subarray(at,at+length));
 if(label(0,4)!=='RIFF'||label(8,4)!=='WAVE'||label(12,4)!=='fmt '||view.getUint32(16,true)!==16||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint32(24,true)!==16000||view.getUint32(28,true)!==32000||view.getUint16(32,true)!==2||view.getUint16(34,true)!==16||label(36,4)!=='data'||view.getUint32(40,true)!==bytes.length-44||view.getUint32(4,true)!==bytes.length-8)throw Error('Expected mono 16 kHz PCM16 WAV audio.');
 const frames=(bytes.length-44)/2;if(!Number.isInteger(frames)||frames<1600||frames>256000)throw Error('Audio must be 0.1–16 seconds long.');
 let sum=0,peak=0;for(let i=44;i<bytes.length;i+=2){const sample=view.getInt16(i,true)/32768;sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
 return {silent:Math.sqrt(sum/frames)<.0002&&peak<.001,seconds:Math.ceil(frames/16000)};
}
function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
function authorize(request){
 const cookie=request.headers.get('Cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('disc_speech='))?.slice('disc_speech='.length);
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!cookie||cookie.length!==36||cookie!==token)reject('Speech session expired. Stop listening and start again.',401);
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   const origin=request.headers.get('Origin');
   if((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')reject('Cross-origin requests are not accepted.',403);
   if(request.method==='GET'&&path==='/api/health')return json({app:'Disc Retainer',speech:env.AI?'cloudflare-whisper':'unavailable',model:MODEL});
   if(request.method==='GET'&&path==='/api/speech/inputs')return json({inputs:[],engine:'cloudflare-whisper',model:MODEL});
   if(request.method==='GET'&&path==='/api/speech/session'){
    const token=crypto.randomUUID();
    // Double-submit session token blocks cross-site browser requests; rate
    // limiting bounds this intentionally public transcription endpoint.
    return json({token,engine:'cloudflare-whisper',model:MODEL},200,{'Set-Cookie':`disc_speech=${token}; HttpOnly; SameSite=Strict; Path=/api/speech; Max-Age=3600${url.protocol==='https:'?'; Secure':''}`});
   }
   if(!['/api/speech/ready','/api/speech/transcribe'].includes(path))reject('Not found.',404);
   if(request.method!=='POST')reject('Expected POST.',405);
   authorize(request);
   if(env.SPEECH_ENABLED!=='true')reject('Hosted speech is temporarily disabled. Use manual input.',503);
   if(!env.AI)reject('Speech recognition is not configured.',503);
   if(path==='/api/speech/ready')return json({ready:true,engine:'cloudflare-whisper',model:MODEL});
   if(request.headers.get('Content-Type')?.split(';')[0]!=='audio/wav')reject('Expected audio/wav.',415);
   const bytes=await boundedBody(request,MAX_AUDIO_BYTES);let audio;
   try{audio=validateWav(bytes);}catch(error){reject(error.message,400);}
   if(audio.silent)return json({text:'',engine:'cloudflare-whisper'});
   const ip=request.headers.get('CF-Connecting-IP')||'development';
   if(!env.SPEECH_LIMITER||!env.GLOBAL_SPEECH_LIMITER)reject('Speech rate limits are not configured.',503);
   const [{success:userAllowed},{success:globalAllowed}]=await Promise.all([env.SPEECH_LIMITER.limit({key:ip}),env.GLOBAL_SPEECH_LIMITER.limit({key:'disc-retainer'})]);
   if(!userAllowed||!globalAllowed)return json({error:'Too many speech requests. Wait a minute, then try again.'},429,{'Retry-After':'60'});
   if(!env.SPEECH_BUDGET)reject('Speech budget protection is unavailable. Use manual input.',503);
   let reservation;
   try{
    const budget=env.SPEECH_BUDGET.get(env.SPEECH_BUDGET.idFromName('global'));
    reservation=await budget.fetch('https://budget/reserve',{method:'POST',body:JSON.stringify({seconds:audio.seconds})});
   }catch{reject('Speech budget protection is unavailable. Use manual input.',503);}
   if(!reservation.ok)return reservation;
   const result=await env.AI.run(MODEL,{audio:base64(bytes),language:'en',task:'transcribe',initial_prompt:SPEECH_CONTEXT,vad_filter:true,condition_on_previous_text:false});
   if(typeof result.text!=='string')reject('Speech recognition returned no transcript. Please retry.',502);
   return json({text:result.text.trim().slice(0,500),engine:'cloudflare-whisper'});
  }catch(error){
   if(error instanceof Response)return error;
   // Do not log audio, transcripts, cookies or provider request payloads.
   console.error('Speech service request failed.');
   return json({error:'Speech recognition is temporarily unavailable. Retry or use manual input.'},502);
  }
 }
};

// A single persistent object serializes reservations from every Cloudflare location.
// Reserve before inference, and never refund failures: retries must also fit the budget.
export const SPEECH_CAPS=Object.freeze({dailySeconds:1800,monthlySeconds:18000,dailyRequests:300,monthlyRequests:3000});
export class SpeechBudget{
 constructor(ctx){this.storage=ctx.storage;}
 async fetch(request){
  const {seconds}=await request.json();
  if(request.method!=='POST'||!Number.isInteger(seconds)||seconds<1||seconds>16)return json({error:'Invalid speech reservation.'},400);
  const now=new Date(),day=now.toISOString().slice(0,10),month=day.slice(0,7);
  const nextDay=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1),nextMonth=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1);
  const decision=await this.storage.transaction(async txn=>{
   const saved=await txn.get('usage');
   const usage={day,month,dailySeconds:0,dailyRequests:0,monthlySeconds:0,monthlyRequests:0,...saved};
   if(usage.day!==day)Object.assign(usage,{day,dailySeconds:0,dailyRequests:0});
   if(usage.month!==month)Object.assign(usage,{month,monthlySeconds:0,monthlyRequests:0});
   const monthly=usage.monthlySeconds+seconds>SPEECH_CAPS.monthlySeconds||usage.monthlyRequests>=SPEECH_CAPS.monthlyRequests;
   const daily=usage.dailySeconds+seconds>SPEECH_CAPS.dailySeconds||usage.dailyRequests>=SPEECH_CAPS.dailyRequests;
   if(monthly||daily)return {allowed:false,period:monthly?'monthly':'daily',reset:monthly?nextMonth:nextDay};
   usage.dailySeconds+=seconds;usage.monthlySeconds+=seconds;usage.dailyRequests++;usage.monthlyRequests++;
   await txn.put('usage',usage);return {allowed:true};
  });
  if(!decision.allowed)return json({error:`Shared ${decision.period} speech allowance used up. Use manual input until ${new Date(decision.reset).toISOString()}.`},429,{'Retry-After':String(Math.max(1,Math.ceil((decision.reset-Date.now())/1000)))});
  return json({allowed:true});
 }
}
