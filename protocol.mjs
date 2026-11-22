// Shared by the local relay, browser receiver, import path, and synthetic producer.
export const MAX_OBSERVATIONS=50000;
export const MAX_GAP_US=250000;
export const MIN_CONFIDENCE=.6;
const required=['version','type','session_id','sequence','capture_time_us','calibration_id','tracking','depth_mm','angle_deg','confidence'];
const optional=['tension_angle_deg','depth_std_mm','angle_std_deg','reprojection_error_px','visible_marker_ids','rotation_epoch','timestamp_source'];
const finiteOrNull=v=>v===null||(typeof v==='number'&&Number.isFinite(v));
export function validateObservation(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||required.some(k=>!Object.hasOwn(input,k))||Object.keys(input).some(k=>![...required,...optional].includes(k)))throw Error('Observation fields do not match protocol v1.');
 if(input.version!==1||input.type!=='pick_observation')throw Error('Unsupported observation version or type.');
 for(const k of ['session_id','calibration_id'])if(typeof input[k]!=='string'||!input[k].length||input[k].length>100)throw Error(`Invalid ${k}.`);
 for(const k of ['sequence','capture_time_us'])if(!Number.isSafeInteger(input[k])||input[k]<0)throw Error(`Invalid ${k}.`);
 if(input.capture_time_us>86400000000)throw Error('Observation exceeds the 24-hour session limit.');
 if(!['tracked','partial','lost'].includes(input.tracking)||!finiteOrNull(input.depth_mm)||!finiteOrNull(input.angle_deg)||typeof input.confidence!=='number'||!Number.isFinite(input.confidence)||input.confidence<0||input.confidence>1)throw Error('Invalid tracking measurements or confidence.');
 if(input.tracking==='tracked'&&(input.depth_mm===null||input.angle_deg===null))throw Error('Tracked observations require depth and angle.');
 if(input.tracking==='lost'&&(input.depth_mm!==null||input.angle_deg!==null||input.confidence!==0))throw Error('Lost tracking must have null measurements and zero confidence.');
 if(input.tracking==='partial'&&input.depth_mm===null&&input.angle_deg===null)throw Error('Partial tracking requires at least one measurement; otherwise use lost.');
 if(Object.hasOwn(input,'tension_angle_deg')&&!finiteOrNull(input.tension_angle_deg))throw Error('Invalid tension angle.');
 for(const k of ['depth_std_mm','angle_std_deg','reprojection_error_px'])if(Object.hasOwn(input,k)&&(!finiteOrNull(input[k])||(input[k]!==null&&input[k]<0)))throw Error(`Invalid ${k}.`);
 if(Object.hasOwn(input,'visible_marker_ids')&&(!Array.isArray(input.visible_marker_ids)||input.visible_marker_ids.length>100||input.visible_marker_ids.some(id=>!Number.isSafeInteger(id)||id<0)||new Set(input.visible_marker_ids).size!==input.visible_marker_ids.length))throw Error('Invalid visible marker IDs.');
 if(Object.hasOwn(input,'rotation_epoch')&&(!Number.isSafeInteger(input.rotation_epoch)||input.rotation_epoch<0))throw Error('Invalid rotation epoch.');
 if(Object.hasOwn(input,'timestamp_source')&&!['camera_capture','media_presentation','processing_monotonic'].includes(input.timestamp_source))throw Error('Invalid timestamp source.');
 return structuredClone(input);
}
export class ObservationStream{
 constructor(){this.last=null;this.count=0;}
 accept(input){const packet=validateObservation(input);const last=this.last;
  if(this.count>=MAX_OBSERVATIONS)throw Error('Observation limit reached. Save this session and start another.');
  if(last){if(packet.session_id!==last.session_id||packet.calibration_id!==last.calibration_id)throw Error('Session or calibration changed. Start a new observation stream explicitly.');
   if((packet.rotation_epoch??0)<(last.rotation_epoch??0))throw Error('Rotation epoch cannot move backward.');
   if((packet.timestamp_source??'unspecified')!==(last.timestamp_source??'unspecified'))throw Error('Timestamp source changed within the observation stream.');
   if(packet.sequence<=last.sequence||packet.capture_time_us<=last.capture_time_us)throw Error('Duplicate or out-of-order observation rejected.');}
  const gap=!!last&&(packet.sequence!==last.sequence+1||packet.capture_time_us-last.capture_time_us>MAX_GAP_US);
  this.last=packet;this.count++;return {packet,gap};
 }
}
export function validateObservationRecords(records=[]){
 if(!Array.isArray(records)||records.length>MAX_OBSERVATIONS)throw Error('Invalid observation records or too many samples.');
 const stream=new ObservationStream();return records.map(record=>{
  if(!record||typeof record.assumedContact!=='boolean')throw Error('Observation contact assumption must be explicit.');
  return {packet:stream.accept(record.packet).packet,assumedContact:record.assumedContact};
 });
}
export function parseObservationJSONL(text){
 const lines=text.split(/\r?\n/).filter(line=>line.trim());if(lines.length>MAX_OBSERVATIONS)throw Error('Too many observation lines.');
 const stream=new ObservationStream();return lines.map((line,i)=>{try{return stream.accept(JSON.parse(line)).packet;}catch(error){throw Error(`Observation line ${i+1}: ${error.message}`);}});
}
export function observationEvents(records){
 const events=[];let last=null;
 const barrier=(time,reason)=>events.push({id:`tracking-break-${events.length}`,type:'tracking_break',time,source:'tracker',note:reason});
 for(const [index,{packet:p,assumedContact}] of records.entries()){
  const t=p.capture_time_us/1e6;
  const usable=p.tracking==='tracked'&&p.confidence>=MIN_CONFIDENCE;
  if(last&&(p.sequence!==last.sequence+1||p.capture_time_us-last.capture_time_us>MAX_GAP_US))barrier(t,'Observation gap');
  if(!usable)barrier(t,`Tracking ${p.tracking}; confidence ${p.confidence}`);
  else events.push({id:`tracker-${p.sequence}`,type:'movement',time:t,source:'tracker',angle:p.angle_deg,depth:p.depth_mm,contact:assumedContact,rotationMode:'unwrapped',channel:`${p.session_id}/${p.calibration_id}/${p.rotation_epoch??0}`,note:'External tool pose; disc contact is an explicit viewer assumption.'});
  const next=records[index+1]?.packet;
  if(usable&&(!next||next.capture_time_us-p.capture_time_us>MAX_GAP_US))barrier(t+MAX_GAP_US/1e6,'Tracking sample expired');
  last=p;
 }
 return events.sort((a,b)=>a.time-b.time);
}
export function trackingAt(records,time){
 let latest=null;for(const r of records){if(r.packet.capture_time_us/1e6>time)break;latest=r.packet;}
 if(!latest)return {state:'none',packet:null};
 if(time-latest.capture_time_us/1e6>MAX_GAP_US/1e6)return {state:'stale',packet:latest};
 if(latest.tracking==='tracked'&&latest.confidence<MIN_CONFIDENCE)return {state:'low confidence',packet:latest};
 return {state:latest.tracking,packet:latest};
}
export function syntheticObservations(){
 return Array.from({length:61},(_,i)=>{const lost=i>=20&&i<=23;return {version:1,type:'pick_observation',session_id:'synthetic-pick-001',sequence:i,capture_time_us:i*100000,calibration_id:'synthetic-bench-001',tracking:lost?'lost':'tracked',depth_mm:lost?null:Math.floor(i/15)*2.5,angle_deg:lost?null:i*8,confidence:lost?0:.95,visible_marker_ids:lost?[]:[0,1]};});
}
