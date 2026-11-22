import {NativeMicrophone,listNativeInputs} from './native-microphone.mjs';
import {SpeechRelay} from './speech-relay.mjs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url),port=Number(process.env.DISC_STUDIO_PORT||8770),host='127.0.0.1';
const speech=new SpeechRelay(),nativeMicrophone=new NativeMicrophone(speech),speechToken=randomBytes(24).toString('hex');
const json=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
const assets=new Map([['/','index.html'],...['index.html','style.css','app.mjs','local-speech.mjs','speech-capture.mjs','voice-commands.mjs','model.mjs','protocol.mjs','scene3d.mjs'].map(file=>['/'+file,file])]);
const server=http.createServer(async(req,res)=>{
 if(![`${host}:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);res.end('Unrecognized local host.');return;}
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);res.end('Cross-origin requests are not accepted.');return;}
 const url=new URL(req.url,`http://${req.headers.host}`),path=url.pathname;
 if(req.method==='GET'&&path==='/api/speech/session')return json(res,200,{token:speechToken,engine:'local-whisper'});
 if(req.method==='GET'&&path==='/api/speech/inputs'){
  try{return json(res,200,{inputs:await listNativeInputs()});}catch{return json(res,200,{inputs:[],error:'Local audio inputs could not be listed.'});}
 }
 if(path.startsWith('/api/speech/native/')){
  const auth=req.headers.authorization??'',expected=`Bearer ${speechToken}`;
  if(Buffer.byteLength(auth)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected)))return json(res,401,{error:'Invalid local speech token.'});
  try{
   if(req.method==='GET'&&path.endsWith('/diagnostics'))return json(res,200,nativeMicrophone.diagnostics());
   if(req.method==='GET'&&path.endsWith('/status'))return json(res,200,nativeMicrophone.poll(url.searchParams.get('session'),Number(url.searchParams.get('after'))||0));
   if(req.method!=='POST'||!['/api/speech/native/start','/api/speech/native/stop'].includes(path))return json(res,404,{error:'Unknown local microphone operation.'});
   if((req.headers['content-type']??'').split(';')[0]!=='application/json')return json(res,415,{error:'Expected application/json.'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2000)return json(res,413,{error:'Request too large.'});chunks.push(chunk);}
   const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(path.endsWith('/start'))return json(res,200,await nativeMicrophone.start(payload.source,payload.check===true));
   if(typeof payload.session!=='string')return json(res,400,{error:'Missing local microphone session.'});nativeMicrophone.stop(payload.session);return json(res,200,{stopped:true});
  }catch(error){return json(res,400,{error:error.message});}
 }
 if(req.method==='POST'&&['/api/speech/ready','/api/speech/transcribe'].includes(path)){
  const auth=req.headers.authorization??'',expected=`Bearer ${speechToken}`;
  if(Buffer.byteLength(auth)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected)))return json(res,401,{error:'Invalid local speech token.'});
  const transcribe=path.endsWith('/transcribe');
  if((req.headers['content-type']??'').split(';')[0]!== (transcribe?'audio/wav':'application/json'))return json(res,415,{error:'Unexpected speech content type.'});
  const chunks=[];let size=0;
  try{for await(const chunk of req){size+=chunk.length;if(size>(transcribe?520000:1000)){json(res,413,{error:'Speech payload too large.'});req.resume();return;}chunks.push(chunk);}
   const result=await speech.request(transcribe?{audio:Buffer.concat(chunks).toString('base64')}:{command:'ready'});return json(res,200,result);
  }catch(error){return json(res,400,{error:error.message});}
 }
 if(req.method!=='GET'||!assets.has(path)){res.writeHead(404);res.end('Not found.');return;}
 try{const filename=assets.get(path),bytes=await readFile(new URL(filename,root));res.writeHead(200,{'Content-Type':filename.endsWith('.mjs')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.svg')?'image/svg+xml':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(bytes);}
 catch{res.writeHead(500);res.end('Could not read local asset.');}
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,host,()=>console.log(`Disc Retainer: http://${host}:${port} · discs and voice notebook`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{nativeMicrophone.close();speech.stop();server.close(()=>process.exit(0));});
