import {validateObservationRecords} from './protocol.mjs';
export const DEFAULT_CONFIG={discCount:8,spacing:2.5,depthOffset:0};
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const angleDelta=(a,b)=>((b-a+180)%360+360)%360-180;
export function discAt(depth,config){const i=Math.round((depth-config.depthOffset)/config.spacing);return i>=0&&i<config.discCount?i:null;}
export const normalizeAngle=a=>((a%360)+360)%360;
export const emptyGeometry=()=>({initialAngleDeg:null,trueGate:null,falseGates:[]});
export function validateConfig(c){
 if(!c||!Number.isInteger(c.discCount)||c.discCount<2||c.discCount>30||!Number.isFinite(c.spacing)||c.spacing<.2||c.spacing>20||!Number.isFinite(c.depthOffset)||Math.abs(c.depthOffset)>100)throw Error('Invalid disc configuration.');
 const radiusMm=c.radiusMm??10,thicknessMm=c.thicknessMm??Math.min(1.5,c.spacing*.6),sidebarAngleDeg=c.sidebarAngleDeg??0;
 if(!Number.isFinite(radiusMm)||radiusMm<2||radiusMm>50||!Number.isFinite(thicknessMm)||thicknessMm<.1||thicknessMm>10||thicknessMm>c.spacing||!Number.isFinite(sidebarAngleDeg)||Math.abs(sidebarAngleDeg)>36000)throw Error('Radius must be 2–50 mm. Thickness must be 0.1–10 mm and cannot exceed disc spacing.');
 const raw=c.discGeometry??Array.from({length:c.discCount},emptyGeometry);
 if(!Array.isArray(raw)||raw.length!==c.discCount)throw Error('Geometry must contain exactly one entry per disc.');
 const discGeometry=raw.map((d,index)=>{
  if(!d||!Array.isArray(d.falseGates)||d.falseGates.length>24)throw Error(`Disc ${index+1}: use at most 24 false gates.`);
  const initial=d.initialAngleDeg;if(initial!==null&&(!Number.isFinite(initial)||Math.abs(initial)>36000))throw Error(`Disc ${index+1}: invalid initial angle.`);
  const gate=(g)=>{if(!g||!Number.isFinite(g.angleDeg)||Math.abs(g.angleDeg)>36000||!Number.isFinite(g.widthDeg)||g.widthDeg<1||g.widthDeg>60||!Number.isFinite(g.depthMm)||g.depthMm<=0||g.depthMm>radiusMm*.65)throw Error(`Disc ${index+1}: invalid gate (width 1–60°, depth >0 and ≤65% of radius).`);return {angleDeg:normalizeAngle(g.angleDeg),widthDeg:g.widthDeg,depthMm:g.depthMm};};
  const trueGate=d.trueGate===null?null:gate(d.trueGate),falseGates=d.falseGates.map(gate);
  if(trueGate&&falseGates.some(g=>g.depthMm>=trueGate.depthMm))throw Error(`Disc ${index+1}: false gates must be shallower than the true gate.`);
  const all=[...(trueGate?[trueGate]:[]),...falseGates];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)if(Math.abs(angleDelta(all[i].angleDeg,all[j].angleDeg))<=(all[i].widthDeg+all[j].widthDeg)/2)throw Error(`Disc ${index+1}: gates overlap or touch.`);
  return {initialAngleDeg:initial===null?null:normalizeAngle(initial),trueGate,falseGates};
 });
 return {discCount:c.discCount,spacing:c.spacing,depthOffset:c.depthOffset,radiusMm,thicknessMm,sidebarAngleDeg:normalizeAngle(sidebarAngleDeg),discGeometry};
}
export function discOutline(geometry,radiusMm,extraAngles=[]){
 const gates=[...(geometry.trueGate?[geometry.trueGate]:[]),...geometry.falseGates];
 const angles=[...Array.from({length:72},(_,i)=>i*5),...extraAngles];
 for(const gate of gates)for(const edge of [gate.angleDeg-gate.widthDeg/2,gate.angleDeg+gate.widthDeg/2])for(const offset of [-.0001,.0001])angles.push(normalizeAngle(edge+offset));
 angles.sort((a,b)=>a-b);
 return angles.map(a=>{const g=gates.find(g=>g.widthDeg>=360||Math.abs(angleDelta(g.angleDeg,a))<g.widthDeg/2);return {angleDeg:a,radiusMm:g?radiusMm-g.depthMm:radiusMm};});
}
export function validateSession(input){
 if(!input||input.version!==1||!Array.isArray(input.events)||input.events.length>50000)throw Error('Unsupported session or too many events.');
 const c=validateConfig(input.config);
 const events=input.events.map((e,i)=>{
  if(!e||!['movement','click','note','gate_hypothesis','gate_clear','gate_reset_all','false_gate_hypothesis','false_gate_clear'].includes(e.type)||!Number.isFinite(e.time)||e.time<0||e.time>86400)throw Error('Invalid event timestamp or type.');
  const out={id:typeof e.id==='string'?e.id.slice(0,100):`import-${i}`,type:e.type,time:e.time,source:['manual','imported','audio_candidate','demo'].includes(e.source)?e.source:'imported',note:String(e.note||'').slice(0,500)};
  if(['gate_hypothesis','gate_clear','false_gate_hypothesis','false_gate_clear'].includes(e.type)){
   if(!Number.isInteger(e.disc)||e.disc<1||e.disc>30)throw Error('Invalid hypothesis disc.');
   out.disc=e.disc;
   if(e.type==='gate_hypothesis'||e.type==='false_gate_hypothesis'){
    if(!['scale','degrees','clicks','marks'].includes(e.units)||![e.from,e.to].every(v=>Number.isFinite(v)&&Math.abs(v)<=36000)||e.to<e.from)throw Error('Invalid suspected gate range.');
    const degreesPerUnit=e.degreesPerUnit??null;
    if(degreesPerUnit!==null&&(!Number.isFinite(degreesPerUnit)||degreesPerUnit<=0||degreesPerUnit>360||((e.to-e.from)*degreesPerUnit)>360))throw Error('Invalid scale mapping or range wider than one turn.');
    Object.assign(out,{from:e.from,to:e.to,units:e.units==='clicks'?'marks':e.units,degreesPerUnit});
   }
  }
  if(e.type==='movement'){
   if(!Number.isFinite(e.angle)||Math.abs(e.angle)>36000||!Number.isFinite(e.depth)||e.depth<0||e.depth>1000||typeof e.contact!=='boolean')throw Error('Invalid movement values.');
   Object.assign(out,{angle:e.angle,depth:e.depth,contact:e.contact});
  }return out;
 }).sort((a,b)=>a.time-b.time);
 const observations=validateObservationRecords(input.observations??[]);
 const duration=Number.isFinite(input.duration)?clamp(input.duration,0,86400):0;
 return {version:1,title:String(input.title||'Untitled session').slice(0,150),config:c,observations,duration:Math.max(duration,...events.map(e=>e.time),(observations.at(-1)?.packet.capture_time_us??0)/1e6),mediaName:String(input.mediaName||'').slice(0,200),events};
}
export function stateAt(events,time,config){
 const moves=events.filter(e=>e.type==='movement'||e.type==='tracking_break').sort((a,b)=>a.time-b.time);
 const discs=Array.from({length:config.discCount},()=>({delta:0,estimated:false}));let tool=null;
 for(let i=0;i<moves.length;i++){
  const e=moves[i];if(e.time>time)break;if(e.type==='tracking_break'){tool=null;continue;}tool={...e};const next=moves[i+1];
  if(!next||next.type==='tracking_break')continue;
  if((e.source==='tracker'||next.source==='tracker')&&(e.source!==next.source||e.channel!==next.channel))continue;
  const ratio=clamp((time-e.time)/(next.time-e.time||1),0,1);
  const d=e.rotationMode==='unwrapped'&&next.rotationMode==='unwrapped'?next.angle-e.angle:angleDelta(e.angle,next.angle);if(time<next.time){tool.angle=e.angle+d*ratio;tool.depth=e.depth+(next.depth-e.depth)*ratio;}
  const index=discAt(e.depth,config),end=discAt(next.depth,config);
  if(index!==null&&index===end&&e.contact&&next.contact&&Math.abs(d)>0){discs[index].delta+=d*ratio;discs[index].estimated=true;}
 }
 for(let i=0;i<discs.length;i++){const initial=config.discGeometry?.[i]?.initialAngleDeg??null;discs[i].absoluteAngleDeg=initial===null?null:normalizeAngle(initial+discs[i].delta);}
 return {discs,tool,engaged:tool?discAt(tool.depth,config):null};
}
export function parseMovementCSV(text){
 const lines=text.trim().split(/\r?\n/);const cols=lines.shift().split(',').map(v=>v.trim());
 if(cols.join(',')!=='time,angle_deg,depth_mm,contact')throw Error('CSV header must be time,angle_deg,depth_mm,contact');
 if(lines.length>50000)throw Error('CSV exceeds 50,000 samples.');
 return lines.filter(l=>l.trim()).map((line,i)=>{const cells=line.split(',').map(x=>x.trim());if(cells.length!==4||cells.slice(0,3).some(x=>!x)||!['true','false'].includes(cells[3]))throw Error(`Invalid CSV row ${i+2}.`);return {id:`csv-${i}`,type:'movement',time:Number(cells[0]),angle:Number(cells[1]),depth:Number(cells[2]),contact:cells[3]==='true',source:'imported',note:''};});
}
export function audioTransients(samples,sampleRate){
 const hop=Math.max(1,Math.floor(sampleRate*.01));const energy=[];for(let i=0;i<samples.length;i+=hop){let sum=0;const end=Math.min(samples.length,i+hop);for(let j=i;j<end;j++)sum+=samples[j]**2;energy.push(Math.sqrt(sum/(end-i)));}
 const hits=[];let last=-100;for(let i=10;i<energy.length-1;i++){const baseline=energy.slice(i-10,i).reduce((a,b)=>a+b,0)/10;const threshold=Math.max(.012,baseline*3.5);if(energy[i]>threshold&&energy[i]>=energy[i-1]&&energy[i]>energy[i+1]&&i-last>15){hits.push(i*.01);last=i;}}
 return hits;
}
export function demoSession(){
 const events=[];for(let d=0;d<5;d++){
  const start=d*3;for(const [dt,angle] of [[0,0],[.8,24],[1.6,46],[2.2,32]])events.push({id:`demo-${d}-${dt}`,type:'movement',time:start+dt,angle,depth:d*2.5,contact:true,source:'demo',note:'Synthetic movement; no real lock measurement.'});
  events.push({id:`demo-click-${d}`,type:'click',time:start+1.6,source:'demo',note:'Synthetic click; not gate evidence.'});
 }return {version:1,title:'Demo · synthetic practice session',config:{...DEFAULT_CONFIG,radiusMm:10,thicknessMm:1.5,sidebarAngleDeg:0,discGeometry:Array.from({length:8},(_,i)=>({initialAngleDeg:i*12,trueGate:{angleDeg:45+i*22,widthDeg:12,depthMm:2.5},falseGates:[{angleDeg:180+i*7,widthDeg:9,depthMm:.7},{angleDeg:280+i*4,widthDeg:9,depthMm:.8}]}))},duration:15,mediaName:'',events:events.sort((a,b)=>a.time-b.time)};
}
