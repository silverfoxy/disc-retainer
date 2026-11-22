// Deliberately narrow grammar: ambiguous speech must be corrected, never guessed.
export function parseGateCommand(transcript,discCount){
 let text=String(transcript).toLowerCase().trim().replace(/[,:;!?]/g,' ').replace(/\.$/,'').replace(/\bdis[ck]s?\b/g,'disc');
 const words={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30};
 text=text.replace(/\b(twenty|thirty)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g,(_,a,b)=>String(words[a]+words[b]));
 text=text.replace(new RegExp(`\\b(${Object.keys(words).join('|')})\\b`,'g'),w=>String(words[w]));
 text=text.replace(/\b(\d+)[ -]+and[ -]+(?:(?:a|1)[ -]+)?half\b/g,(_,whole)=>String(Number(whole)+.5));
 text=text.replace(/\b(\d+)\s+1\/2\b/g,(_,whole)=>String(Number(whole)+.5)).replace(/(\d+)\s*½/g,(_,whole)=>String(Number(whole)+.5));
 text=text.replace(/\b(?:a[ -]+)?half\b|½/g,'0.5');
 text=text.replace(/\b(\d+)\s+point\s+(\d(?:\s+\d)*)/g,(_,a,b)=>`${a}.${b.replace(/\s/g,'')}`).replace(/\s+/g,' ').trim();
 text=text.replace(/(\d)\s*[-–—]\s*(?=\d)/g,'$1 to ');
 const parts=text.split(/(?=\bdisc \d+\b)/).map(part=>part.trim().replace(/\.$/,'')).filter(Boolean);
 if(parts.length>1&&parts.every(part=>part.startsWith('disc '))){
  const commands=parts.map(part=>parseGateCommand(part,discCount));
  if(commands.every(command=>JSON.stringify(command)===JSON.stringify(commands[0])))return commands[0];
  throw Error('Say one disc and range at a time, then wait for Listening before the next command.');
 }
 if(/^reset all (?:the )?disc(?: please)?$/.test(text))return {type:'gate_reset_all'};
 const falseClear=text.match(/^clear false gates? (?:on |for )?disc (\d+)$/);
 const clear=text.match(/^(?:reset |clear (?:gate (?:on |for )?)?)disc (\d+)$/);
 const number='(-?\\d+(?:\\.\\d+)?)';
 const range=text.match(new RegExp(`^disc (\\d+) (?:(?:false )?gate )?(?:from |at |is )?${number}(?: (?:(?:clicks?|marks?|markers?) )?(?:until|to|through) ${number})?(?: (?:degrees|clicks?|marks?|markers?))?$`));
 if(!range&&!clear&&!falseClear)throw Error('Say “disc 2, gate from 2.5 to 3.5” or “reset disc 2” or “reset all discs”. Correct the transcript below if needed.');
 const disc=Number((falseClear??clear??range)[1]);
 if(!Number.isInteger(disc)||disc<1||disc>discCount)throw Error(`Choose a disc from 1 to ${discCount}.`);
 if(falseClear)return {type:'false_gate_clear',disc};
 if(clear)return {type:'gate_clear',disc};
 const from=Number(range[2]),to=range[3]===undefined?from:Number(range[3]);
 if(!Number.isFinite(from)||!Number.isFinite(to)||Math.abs(from)>36000||Math.abs(to)>36000)throw Error('Use finite readings between −36000 and 36000.');
 if(to<from)throw Error('Give the lower reading first. For a range crossing zero, use an unwrapped end reading (for example 350 to 370 degrees).');
 return {type:/\bfalse gate\b/.test(text)?'false_gate_hypothesis':'gate_hypothesis',disc,from,to};
}
export function gateHypothesesAt(events,time,discCount){
 const result=Array(discCount).fill(null);
 for(const event of [...events].sort((a,b)=>a.time-b.time)){
  if(event.time>time)break;
  if(event.type==='gate_reset_all'){result.fill(null);continue;}
  if(event.disc<1||event.disc>discCount)continue;
  if(event.type==='gate_hypothesis')result[event.disc-1]=event;
  if(event.type==='gate_clear')result[event.disc-1]=null;
 }
 return result;
}

export function falseGatesAt(events,time,discCount){
 const result=Array.from({length:discCount},()=>[]);
 for(const event of [...events].sort((a,b)=>a.time-b.time)){
  if(event.time>time)break;
  if(event.type==='gate_reset_all'){result.forEach(gates=>gates.length=0);continue;}
  if(!Number.isInteger(event.disc)||event.disc<1||event.disc>discCount)continue;
  const gates=result[event.disc-1];
  if(event.type==='gate_clear'||event.type==='false_gate_clear')gates.length=0;
  if(event.type==='false_gate_hypothesis'){
   const index=gates.findIndex(gate=>gate.from===event.from&&gate.to===event.to&&gate.degreesPerUnit===event.degreesPerUnit);
   if(index<0)gates.push(event);else gates[index]=event;
  }
 }
 return result;
}

export function gateAlignmentDegrees(gate,sidebarAngleDeg=0,counterRotate=false){
 if(!gate||gate.degreesPerUnit===null)return 0;
 const midpoint=(gate.from+gate.to)/2*gate.degreesPerUnit;
 if(counterRotate){const angle=((sidebarAngleDeg-midpoint)%360+360)%360;return angle===0?0:angle-360;}
 return ((sidebarAngleDeg-midpoint+180)%360+360)%360-180;
}

// Explicit simulation assumption supplied by the user, not a recorded observation.
export function withTensionedFirstDisc(gates,sidebarAngleDeg=0){
 if(!gates.length)return [];
 const reading=sidebarAngleDeg/45;
 if(gates[0])return [...gates];
 return [{type:'gate_hypothesis',disc:1,from:reading,to:reading,units:'marks',degreesPerUnit:45,assumed:true},...gates.slice(1)];
}

export function gateCommandAlreadyApplied(command,events){
 const gates=gateHypothesesAt(events,Infinity,30),falseGates=falseGatesAt(events,Infinity,30);
 if(command.type==='gate_reset_all')return gates.every(gate=>gate===null)&&falseGates.every(gates=>!gates.length);
 const latest=gates[command.disc-1],falses=falseGates[command.disc-1]??[];
 if(command.type==='gate_clear')return !latest&&!falses.length;
 if(command.type==='false_gate_clear')return !falses.length;
 const same=gate=>gate?.from===command.from&&gate.to===command.to&&['marks','clicks'].includes(gate.units)&&gate.degreesPerUnit===45;
 if(command.type==='false_gate_hypothesis')return falses.some(same);
 return same(latest);
}

// Preserve first-entry order for active true gates; edits keep their place.
export function gateEntryOrder(events,discCount){
 const order=[];
 for(const event of [...events].sort((a,b)=>a.time-b.time)){
  if(event.type==='gate_reset_all'){order.length=0;continue;}
  if(!Number.isInteger(event.disc)||event.disc<1||event.disc>discCount)continue;
  const index=event.disc-1,position=order.indexOf(index);
  if(event.type==='gate_clear'&&position>=0)order.splice(position,1);
  if(event.type==='gate_hypothesis'&&position<0)order.push(index);
 }
 return order;
}

// View-only replay: observations remain unchanged while the tool visits each disc.
export function createPickingSequence(gates,{rotations=[],depth=1,tipAngle=0,sidebarInset=0,loweredInset=0,coreRotationDeg=0,sidebarAngleDeg=0,order=gates.flatMap((gate,i)=>i===0&&gate?.assumed?[]:[i])}={}){
 if(gates.length<2||gates.some(gate=>!gate||!Number.isFinite(gate.degreesPerUnit)||gate.degreesPerUnit<=0))throw Error('Set a mapped true gate for every disc from disc 2 onward first.');
 const expected=gates.flatMap((gate,i)=>i===0&&gate?.assumed?[]:[i]);
 if(order.length!==expected.length||new Set(order).size!==order.length||order.some(index=>!expected.includes(index)))throw Error('Each entered true gate must appear once in the picking order.');
 return {order:[...order],targets:gates.map((gate,i)=>gateAlignmentDegrees(gate,sidebarAngleDeg,i===0)),initialRotations:gates.map((_,i)=>rotations[i]??0),initialDepth:depth,initialTipAngle:tipAngle,initialInset:sidebarInset,initialCoreRotationDeg:coreRotationDeg,loweredInset,duration:900+order.length*1800+1700};
}
export function pickingSequenceAt(sequence,elapsed){
 const t=Math.max(0,elapsed),smooth=x=>{const p=Math.max(0,Math.min(1,x));return p*p*(3-2*p);},mix=(a,b,p)=>a+(b-a)*smooth(p);
 const rotations=sequence.targets.map(()=>0),last=sequence.order.at(-1);
 if(t<900)return {phase:'reset',disc:sequence.order[0],depth:mix(sequence.initialDepth,1,t/900),tipAngle:mix(sequence.initialTipAngle,0,t/900),rotations:sequence.initialRotations.map(value=>mix(value,0,t/900)),sidebarInset:mix(sequence.initialInset,0,t/700),coreRotationDeg:mix(sequence.initialCoreRotationDeg??0,0,t/900),done:false};
 const step=Math.floor((t-900)/1800),within=(t-900)%1800;
 if(step<sequence.order.length){
  const disc=sequence.order[step],previous=sequence.order.slice(0,step).filter(index=>index>0).at(-1)??1;
  for(const index of sequence.order.slice(0,step))rotations[index]=sequence.targets[index];
  const turning=within>=650,angle=turning?mix(0,sequence.targets[disc],(within-650)/900):0;
  rotations[disc]=angle;
  const previousPicked=sequence.order.slice(0,step).some(index=>index>0),previousTipAngle=previousPicked?sequence.targets[previous]:0;
  return {phase:within<650?'move':within<1550?(disc===0?'counterturn':'turn'):'hold',disc,depth:disc===0?previous:within<650?mix(previous,disc,within/650):disc,tipAngle:disc===0?previousTipAngle:turning?angle:mix(previousTipAngle,0,within/650),rotations,sidebarInset:0,coreRotationDeg:0,done:false};
 }
 const lowerTime=t-900-sequence.order.length*1800,lastPicked=sequence.order.filter(index=>index>0).at(-1)??1;
 return {phase:lowerTime<700?'sidebar':lowerTime<1700?'unlock':'complete',disc:last,depth:lastPicked,tipAngle:sequence.targets[lastPicked],rotations:[...sequence.targets],sidebarInset:mix(0,sequence.loweredInset,lowerTime/700),coreRotationDeg:mix(0,90,(lowerTime-700)/1000),done:lowerTime>=1700};
}

export function gateTableRows(events,discCount,sidebarAngleDeg=0){
 const recorded=gateHypothesesAt(events,Infinity,discCount),gates=withTensionedFirstDisc(recorded,sidebarAngleDeg);
 let observations=[];
 for(const event of [...events].sort((a,b)=>a.time-b.time)){
  if(event.type==='gate_reset_all'){observations=[];continue;}
  if(!Number.isInteger(event.disc)||event.disc<1||event.disc>discCount)continue;
  if(event.type==='gate_clear'){observations=observations.filter(entry=>entry.disc!==event.disc);continue;}
  if(event.type==='false_gate_clear'){observations=observations.filter(entry=>entry.disc!==event.disc||entry.type!=='false_gate_hypothesis');continue;}
  if(!['gate_hypothesis','false_gate_hypothesis'].includes(event.type))continue;
  const previous=observations.findIndex(entry=>entry.disc===event.disc&&entry.type===event.type&&(event.type==='gate_hypothesis'||(entry.from===event.from&&entry.to===event.to&&entry.degreesPerUnit===event.degreesPerUnit)));
  if(previous<0)observations.push(event);else observations[previous]=event;
 }
 if(gates[0]?.assumed)observations.unshift(gates[0]);
 const reading=gate=>`${gate.from===gate.to?gate.from:`${gate.from}–${gate.to}`} ${gate.units==='clicks'?'marks':gate.units}`;
 const rows=observations.map((gate,position)=>{
  const isFalse=gate.type==='false_gate_hypothesis',value=reading(gate);
  const action=isFalse?`Skip false gate at ${value}`:gate.assumed?`Hold tensioner at ${value} (assumed)`:gate.disc===1?`Counter-rotate tensioner to ${value}`:`Set pick within ${value}`;
  return {step:position+1,disc:gate.disc,trueGate:isFalse?'':`${value}${gate.assumed?' (assumed)':''}`,falseGates:isFalse?value:'',action};
 });
 // Missing true gates have no recorded setting step, even if false gates are known.
 for(let index=0;index<discCount;index++)if(!gates[index])rows.push({step:'',disc:index+1,trueGate:'Not recorded',falseGates:'',action:'Record true gate'});
 return rows;
}
export function gateTableCsv(events,discCount,sidebarAngleDeg=0){
 const escape=value=>`"${String(value).replaceAll('"','""')}"`;
 const rows=[['Step','Disc','True gate','False gate','Action'],...gateTableRows(events,discCount,sidebarAngleDeg).map(row=>[row.step,row.disc,row.trueGate,row.falseGates,row.action])];
 return '\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
}
