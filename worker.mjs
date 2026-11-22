const MODEL='@cf/openai/whisper-large-v3-turbo';
const MAX_AUDIO_BYTES=512044;
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
 return {silent:Math.sqrt(sum/frames)<.0002&&peak<.001};
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
   const result=await env.AI.run(MODEL,{audio:base64(bytes),language:'en',task:'transcribe',vad_filter:true,condition_on_previous_text:false});
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
