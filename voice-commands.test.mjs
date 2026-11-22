import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGateCommand,gateHypothesesAt,gateAlignmentDegrees,gateCommandAlreadyApplied} from './voice-commands.mjs';
import {validateSession,DEFAULT_CONFIG,stateAt} from './model.mjs';
import {buildDiscScene} from './scene3d.mjs';
const base={version:1,config:DEFAULT_CONFIG,events:[],duration:15};
test('recognizes numeric and spoken ranges including the user phrase',()=>{
 for(const text of ['disc 2 2.5 click until 3.5','Disc two, gate from two point five to three point five.','disk 2 gate at 2.5 through 3.5'])assert.deepEqual(parseGateCommand(text,8),{type:'gate_hypothesis',disc:2,from:2.5,to:3.5});
 assert.deepEqual(parseGateCommand('disc twenty one at five point two five',30),{type:'gate_hypothesis',disc:21,from:5.25,to:5.25});
 assert.deepEqual(parseGateCommand('clear disc two',8),{type:'gate_clear',disc:2});
});
test('rejects ambiguous, incomplete and extra speech',()=>{
 for(const text of ['disc 2','disc 2 2.5 until','disc 9 gate at 3','disc 2 3.5 to 2.5','disc 2 2.5 to 3.5 and disc 3 at 4','disc 2 maybe at 4'])assert.throws(()=>parseGateCommand(text,8));
});
const hypothesis=(time,from=2.5)=>({id:`gate-${time}`,type:'gate_hypothesis',disc:2,from,to:3.5,units:'scale',degreesPerUnit:null,time,source:'manual',note:'Suspected gate'});
test('session round trip preserves ranges without changing configured true gates',()=>{
 const session=validateSession({...base,events:[hypothesis(2)]});
 assert.equal(session.events[0].degreesPerUnit,null);
 assert.equal(session.config.discGeometry[1].trueGate,null);
 assert.deepEqual(validateSession(JSON.parse(JSON.stringify(session))),session);
 assert.throws(()=>validateSession({...base,events:[{...hypothesis(2),degreesPerUnit:-2}]}));
 assert.throws(()=>validateSession({...base,events:[{...hypothesis(2),from:0,to:361,degreesPerUnit:1}]}));
});
test('replay applies updates and clearing at their timestamps, deleting restores previous entry',()=>{
 const events=[hypothesis(2),hypothesis(4,3),{type:'gate_clear',disc:2,time:6}];
 assert.equal(gateHypothesesAt(events,1,8)[1],null);
 assert.equal(gateHypothesesAt(events,3,8)[1].from,2.5);
 assert.equal(gateHypothesesAt(events,5,8)[1].from,3);
 assert.equal(gateHypothesesAt(events,7,8)[1],null);
 assert.equal(gateHypothesesAt(events.slice(0,-1),7,8)[1].from,3);
});
test('3D highlights unknown-unit hypotheses; angular arcs require an explicit mapping',()=>{
 const session=validateSession({...base,events:[hypothesis(0)]});const state=stateAt([],0,session.config);
 state.gateHypotheses=gateHypothesesAt(session.events,0,8);
 let scene=buildDiscScene(session.config,state);
 assert.equal(scene.marks.some(m=>m.hypothesis),false);
 assert.equal(scene.labels.find(l=>l.hypothesis).text,'2.5–3.5 scale');
 assert.deepEqual(scene.faces.find(f=>f.disc===1).color,[192,137,60]);
 state.gateHypotheses[1]={...state.gateHypotheses[1],degreesPerUnit:45};
 scene=buildDiscScene(session.config,state);assert.equal(scene.marks.filter(m=>m.hypothesis).length,46);
});

test('gate-is ranges and midpoint alignment use eight clicks per turn',()=>{
 const command=parseGateCommand('disc 2 gate is 2–3.5',8);
 assert.deepEqual(command,{type:'gate_hypothesis',disc:2,from:2,to:3.5});
 assert.equal(gateAlignmentDegrees({...command,degreesPerUnit:45}),-123.75);
});

test('natural half readings, decimals and numeric fractions agree',()=>{
 for(const text of ['disc four gate from two to two and a half','disc 4 gate from 2 to 2.5','disc 4 gate from 2 to 2½','disc 4 gate from 2 to 2 1/2','disc four gate from two to two-and-a-half'])assert.deepEqual(parseGateCommand(text,8),{type:'gate_hypothesis',disc:4,from:2,to:2.5});
});
test('identical phrases repeated in one transcript register as one command',()=>{
 assert.deepEqual(parseGateCommand('Disc four gate from two to two and a half. Disc 4 gate from 2 to 2.5.',8),{type:'gate_hypothesis',disc:4,from:2,to:2.5});
 assert.throws(()=>parseGateCommand('disc four gate from two to two and a half. disc five gate at three.',8));
});
test('canonical duplicates are ignored but changed ranges and undo/clear can be recorded',()=>{
 const command=parseGateCommand('disc four gate from two to two and a half',8),event={...command,units:'clicks',degreesPerUnit:45,time:1};
 assert.equal(gateCommandAlreadyApplied(command,[event]),true);
 assert.equal(gateCommandAlreadyApplied({...command,to:3},[event]),false);
 assert.equal(gateCommandAlreadyApplied(command,[event,{type:'gate_clear',disc:4,time:2}]),false);
 assert.equal(gateCommandAlreadyApplied(command,[]),false);
});

test('mark units and spoken halves register and old click labels migrate',()=>{
 for(const text of ['disc four gate from two marks to two and a half marks','disc 4 2 marks until 2.5 marks','disc 4 gate from 2 markers to 2.5 markers'])assert.deepEqual(parseGateCommand(text,8),{type:'gate_hypothesis',disc:4,from:2,to:2.5});
 const old={...hypothesis(0),units:'clicks',degreesPerUnit:45};
 const restored=validateSession({...base,events:[old]});
 assert.equal(restored.events[0].units,'marks');assert.equal(restored.events[0].degreesPerUnit,45);assert.equal(restored.events[0].from,old.from);assert.equal(restored.events[0].to,old.to);
});

test('reset commands accept spoken numbers and Whisper spelling and reject invalid targets',()=>{
 for(const text of ['reset disc four','Reset disk 4.','reset disc twenty one'])assert.deepEqual(parseGateCommand(text,30),{type:'gate_clear',disc:text.includes('twenty')?21:4});
 for(const text of ['reset all discs','Reset all disks.'])assert.deepEqual(parseGateCommand(text,8),{type:'gate_reset_all'});
 for(const text of ['reset disc zero','reset disc nine','reset all discs and disc 2 gate at 3'])assert.throws(()=>parseGateCommand(text,8));
});
test('reset all survives serialization, clears hidden discs, and undo restores every range',()=>{
 const original=[hypothesis(1),{...hypothesis(2),disc:20}];
 const reset={id:'reset',type:'gate_reset_all',time:3};
 const restored=validateSession(JSON.parse(JSON.stringify({...base,events:[...original,reset]})));
 assert.equal(gateHypothesesAt(restored.events,2,30).filter(Boolean).length,2);
 assert.equal(gateHypothesesAt(restored.events,3,30).filter(Boolean).length,0);
 assert.equal(gateAlignmentDegrees(gateHypothesesAt(restored.events,3,30)[1]),0);
 assert.equal(gateHypothesesAt(restored.events.filter(e=>e.id!=='reset'),Infinity,30).filter(Boolean).length,2);
 const newGate={...hypothesis(4),units:'marks',degreesPerUnit:45};
 assert.equal(gateHypothesesAt([...restored.events,newGate],Infinity,30)[1].time,4);
});
test('reset duplicate detection follows resets and subsequent entries',()=>{
 const command={type:'gate_hypothesis',disc:2,from:2.5,to:3.5};
 const gate={...command,time:1,units:'marks',degreesPerUnit:45},reset={type:'gate_reset_all',time:2};
 assert.equal(gateCommandAlreadyApplied({type:'gate_reset_all'},[gate]),false);
 assert.equal(gateCommandAlreadyApplied({type:'gate_reset_all'},[gate,reset]),true);
 assert.equal(gateCommandAlreadyApplied(command,[gate,reset]),false);
 assert.equal(gateCommandAlreadyApplied({type:'gate_clear',disc:2},[gate,reset]),true);
 assert.equal(gateCommandAlreadyApplied({type:'gate_reset_all'},[gate,reset,{...gate,time:3}]),false);
 assert.equal(gateCommandAlreadyApplied({type:'gate_reset_all'},[{...gate,disc:20}]),false);
});

test('false gates accept voice ranges, serialize, accumulate, clear, reset and undo separately',async()=>{
 const {falseGatesAt}=await import('./voice-commands.mjs');
 const first=parseGateCommand('disc four false gate from two to two and a half',8);
 assert.deepEqual(first,{type:'false_gate_hypothesis',disc:4,from:2,to:2.5});
 assert.deepEqual(parseGateCommand('clear false gates disc four',8),{type:'false_gate_clear',disc:4});
 const make=(command,time)=>({...command,time,units:'marks',degreesPerUnit:45});
 const events=[make({type:'gate_hypothesis',disc:4,from:5,to:6},1),make(first,2),make({...first,from:3,to:3},3)];
 const roundTrip=validateSession(JSON.parse(JSON.stringify({...base,title:'Practice lock',events})));
 assert.equal(roundTrip.title,'Practice lock');
 assert.equal(falseGatesAt(roundTrip.events,Infinity,8)[3].length,2);
 assert.equal(gateHypothesesAt(roundTrip.events,Infinity,8)[3].from,5);
 assert.equal(gateCommandAlreadyApplied(first,events),true);
 const cleared=[...events,{type:'false_gate_clear',disc:4,time:4}];
 assert.equal(falseGatesAt(cleared,Infinity,8)[3].length,0);
 assert.equal(gateHypothesesAt(cleared,Infinity,8)[3].from,5);
 assert.equal(gateCommandAlreadyApplied(first,cleared),false);
 for(const reset of [{type:'gate_clear',disc:4,time:4},{type:'gate_reset_all',time:4}]){
  assert.equal(falseGatesAt([...events,reset],Infinity,8)[3].length,0);
  assert.equal(gateHypothesesAt([...events,reset],Infinity,8)[3],null);
 }
 assert.equal(falseGatesAt(events,Infinity,8)[3].length,2);
 const falseOnly=[make(first,1)];
 assert.equal(gateCommandAlreadyApplied({type:'gate_clear',disc:4},falseOnly),false);
 assert.equal(gateCommandAlreadyApplied({type:'gate_reset_all'},falseOnly),false);
 assert.throws(()=>validateSession({...base,events:[make({...first,to:1},1)]}));
});

test('true gates retain entry order across edits, reset/re-entry and notebook round trips',async()=>{
 const {gateEntryOrder}=await import('./voice-commands.mjs');
 const event=(disc,time,type='gate_hypothesis')=>({type,disc,time,from:1,to:2,units:'marks',degreesPerUnit:45});
 const events=[event(4,1),event(2,2),event(3,3),event(4,4),event(5,5,'false_gate_hypothesis')];
 assert.deepEqual(gateEntryOrder(events,8),[3,1,2]);
 const reset=[...events,event(2,6,'gate_clear'),event(2,7)];
 assert.deepEqual(gateEntryOrder(reset,8),[3,2,1]);
 assert.deepEqual(gateEntryOrder(validateSession({...base,events:reset}).events,8),[3,2,1]);
 assert.deepEqual(gateEntryOrder([...reset,{type:'gate_reset_all',time:8}],8),[]);
});
test('picking replay sets discs in entry order, seats the sidebar, then turns the core',async()=>{
 const {createPickingSequence,pickingSequenceAt}=await import('./voice-commands.mjs');
 const gates=Array.from({length:4},(_,i)=>({from:i,to:i+.5,degreesPerUnit:45}));
 gates[0].assumed=true;
 const before=JSON.stringify(gates),order=[3,1,2];
 const replay=createPickingSequence(gates,{order,rotations:[0,-30,-60,-90],depth:2,sidebarInset:12,loweredInset:12});
 assert.equal(pickingSequenceAt(replay,0).sidebarInset,12);
 const reset=pickingSequenceAt(replay,900);assert.deepEqual(reset.rotations,[0,0,0,0]);assert.equal(reset.sidebarInset,0);
 for(let step=0;step<order.length;step++){
  const start=900+step*1800,disc=order[step];
  const move=pickingSequenceAt(replay,start);assert.equal(move.phase,'move');assert.equal(move.disc,disc);
  const turn=pickingSequenceAt(replay,start+1100);assert.equal(turn.phase,'turn');assert.equal(turn.depth,disc);assert.equal(turn.sidebarInset,0);
  assert.equal(turn.rotations[disc],replay.targets[disc]/2);
  for(const previous of order.slice(0,step))assert.equal(turn.rotations[previous],replay.targets[previous]);
  for(const future of order.slice(step+1))assert.equal(turn.rotations[future],0);
  const hold=pickingSequenceAt(replay,start+1600);assert.equal(hold.rotations[disc],replay.targets[disc]);assert.equal(hold.rotations[0],0);
 }
 const loweredAt=900+3*1800;
 assert.equal(pickingSequenceAt(replay,loweredAt).phase,'sidebar');
 assert.equal(pickingSequenceAt(replay,loweredAt+350).sidebarInset,6);
 assert.equal(pickingSequenceAt(replay,loweredAt+350).coreRotationDeg,0);
 const turn=pickingSequenceAt(replay,loweredAt+1200);assert.equal(turn.phase,'unlock');assert.equal(turn.sidebarInset,12);assert.equal(turn.coreRotationDeg,45);
 const done=pickingSequenceAt(replay,replay.duration);assert.equal(done.done,true);assert.equal(done.coreRotationDeg,90);assert.deepEqual(done.rotations,replay.targets);
 assert.equal(JSON.stringify(gates),before);assert.deepEqual(order,[3,1,2]);
 assert.throws(()=>createPickingSequence([gates[0],null]));assert.throws(()=>createPickingSequence(gates,{order:[1,1,2]}));
});

test('disc 1 gates override the assumed stop and counter-rotate beyond a half turn when needed',async()=>{
 const {withTensionedFirstDisc,gateEntryOrder,falseGatesAt}=await import('./voice-commands.mjs');
 const explicit={...parseGateCommand('disc one gate from five to five and a half',8),units:'marks',degreesPerUnit:45,time:1};
 const gates=gateHypothesesAt([explicit],Infinity,8);
 assert.equal(withTensionedFirstDisc(gates)[0],explicit);
 assert.equal(gateAlignmentDegrees(explicit,0,true),-236.25);
 assert.equal(gateAlignmentDegrees(explicit),123.75);
 assert.deepEqual(gateEntryOrder([explicit],8),[0]);
 assert.equal(gateCommandAlreadyApplied({type:'gate_reset_all'},[explicit]),false);
 const cleared=[explicit,{type:'false_gate_hypothesis',disc:1,from:3,to:3,units:'marks',degreesPerUnit:45,time:2},{type:'gate_clear',disc:1,time:3}];
 assert.equal(withTensionedFirstDisc(gateHypothesesAt(cleared,Infinity,8))[0].assumed,true);
 assert.equal(falseGatesAt(cleared,Infinity,8)[0].length,0);
 assert.equal(gateAlignmentDegrees(withTensionedFirstDisc(gateHypothesesAt(cleared,Infinity,8))[0],0,true),0);
});
test('disc 1 replay counter-turns the tensioner in saved order without moving the inner tip',async()=>{
 const {createPickingSequence,pickingSequenceAt,gateEntryOrder}=await import('./voice-commands.mjs');
 const events=[{type:'gate_hypothesis',disc:3,from:1,to:1.5,time:1,units:'marks',degreesPerUnit:45},{type:'gate_hypothesis',disc:2,from:2,to:2.5,time:2,units:'marks',degreesPerUnit:45},{type:'gate_hypothesis',disc:1,from:5,to:5.5,time:3,units:'marks',degreesPerUnit:45}];
 const restored=validateSession({...base,config:{...DEFAULT_CONFIG,discCount:3},events}),order=gateEntryOrder(restored.events,3);
 assert.deepEqual(order,[2,1,0]);
 const replay=createPickingSequence(gateHypothesesAt(restored.events,Infinity,3),{order,loweredInset:12});
 const pose=pickingSequenceAt(replay,900+2*1800+1100);
 assert.equal(pose.phase,'counterturn');assert.equal(pose.disc,0);assert.equal(pose.depth,1);
 assert.equal(pose.tipAngle,replay.targets[1]);assert.equal(pose.rotations[0],-118.125);assert.equal(pose.sidebarInset,0);
 const done=pickingSequenceAt(replay,replay.duration);assert.equal(done.rotations[0],-236.25);assert.equal(done.depth,1);assert.equal(done.sidebarInset,12);assert.equal(done.coreRotationDeg,90);
});

test('gate table exports current true/false ranges in recorded order with explicit disc 1 counter-turn',async()=>{
 const {gateTableRows,gateTableCsv}=await import('./voice-commands.mjs');
 const gate=(disc,from,to,time,type='gate_hypothesis')=>({type,disc,from,to,time,units:'marks',degreesPerUnit:45});
 const events=[gate(4,2,3,1),gate(2,1,1.5,2),gate(1,5,5.5,3),gate(4,3,3.5,4),gate(4,1,1,5,'false_gate_hypothesis'),gate(4,6,6.5,6,'false_gate_hypothesis'),gate(3,2,2,7,'false_gate_hypothesis')];
 const before=JSON.stringify(events),rows=gateTableRows(events,4);
 assert.deepEqual(rows.map(row=>[row.step,row.disc]),[[1,4],[2,2],[3,1],[4,4],[5,4],[6,3],['',3]]);
 assert.equal(rows[0].trueGate,'3–3.5 marks');assert.equal(rows[0].falseGates,'');assert.equal(rows[3].falseGates,'1 marks');assert.equal(rows[3].trueGate,'');assert.equal(rows[4].falseGates,'6–6.5 marks');
 assert.equal(rows[2].action,'Counter-rotate tensioner to 5–5.5 marks');
 assert.equal(rows[5].falseGates,'2 marks');assert.equal(rows[5].action,'Skip false gate at 2 marks');assert.equal(rows[6].trueGate,'Not recorded');assert.equal(rows[6].action,'Record true gate');
 const csv=gateTableCsv(events,4);assert.ok(csv.startsWith('\uFEFF"Step","Disc","True gate","False gate","Action"\r\n'));assert.equal(csv.trim().split('\r\n').length,8);
 assert.equal(JSON.stringify(events),before);
});
test('gate table marks assumed first disc and omits cleared observations',async()=>{
 const {gateTableRows}=await import('./voice-commands.mjs');
 const events=[{type:'gate_hypothesis',disc:3,from:2,to:3,time:1,units:'marks',degreesPerUnit:45},{type:'false_gate_hypothesis',disc:3,from:1,to:1,time:2,units:'marks',degreesPerUnit:45},{type:'false_gate_clear',disc:3,time:3}];
 const rows=gateTableRows(events,3);assert.deepEqual(rows.map(row=>[row.step,row.disc]),[[1,1],[2,3],['',2]]);
 assert.equal(rows[0].trueGate,'0 marks (assumed)');assert.equal(rows[0].action,'Hold tensioner at 0 marks (assumed)');assert.equal(rows[1].falseGates,'');
 const reset=gateTableRows([...events,{type:'gate_reset_all',time:4}],3);assert.equal(reset[1].step,'');assert.equal(reset[1].trueGate,'Not recorded');
});

test('table interleaves separate false-gate steps with true gates and drops cleared steps',async()=>{
 const {gateTableRows}=await import('./voice-commands.mjs');
 const gate=(type,disc,time,from=2,to=2.5)=>({type,disc,time,from,to,units:'marks',degreesPerUnit:45});
 const events=[gate('false_gate_hypothesis',3,1),gate('gate_hypothesis',2,2),gate('gate_hypothesis',3,3),gate('false_gate_hypothesis',3,4,4,4.5),gate('gate_hypothesis',2,5,1,1.5),gate('false_gate_hypothesis',3,6)];
 const rows=gateTableRows(events,3);
 assert.deepEqual(rows.map(row=>[row.step,row.disc,Boolean(row.falseGates)]),[[1,1,false],[2,3,true],[3,2,false],[4,3,false],[5,3,true]]);
 assert.equal(rows[2].trueGate,'1–1.5 marks');
 const cleared=gateTableRows([...events,{type:'false_gate_clear',disc:3,time:7}],3);
 assert.deepEqual(cleared.map(row=>[row.step,row.disc]),[[1,1],[2,2],[3,3]]);
 const reset=gateTableRows([...events,{type:'gate_clear',disc:3,time:7},gate('gate_hypothesis',3,8)],3);
 assert.deepEqual(reset.map(row=>[row.step,row.disc]),[[1,1],[2,2],[3,3]]);assert.ok(reset.every(row=>!row.falseGates));
});
