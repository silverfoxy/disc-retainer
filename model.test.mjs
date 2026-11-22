import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,validateSession,stateAt,discAt,angleDelta,parseMovementCSV,audioTransients,demoSession,validateConfig,emptyGeometry,discOutline} from './model.mjs';
const sample=(time,angle,depth,contact=true)=>({id:String(time),type:'movement',time,angle,depth,contact,source:'manual'});
test('rotation unwraps across 180 degrees',()=>assert.equal(angleDelta(170,-170),20));
test('only same-disc assumed contact produces relative motion',()=>{
 const config=DEFAULT_CONFIG;let s=stateAt([sample(0,0,0),sample(1,40,0)],.5,config);assert.equal(s.discs[0].delta,20);assert.equal(s.discs[0].estimated,true);
 s=stateAt([sample(0,0,0,false),sample(1,40,0)],1,config);assert.equal(s.discs[0].estimated,false);
 s=stateAt([sample(0,0,0),sample(1,40,2.5)],1,config);assert.ok(s.discs.every(d=>!d.estimated));
});
test('clicks do not set or rotate discs',()=>{const s=stateAt([{type:'click',time:1,source:'audio_candidate'}],5,DEFAULT_CONFIG);assert.ok(s.discs.every(d=>d.delta===0&&!d.estimated));assert.equal(s.tool,null);});
test('depth offset and out-of-stack positions',()=>{assert.equal(discAt(10,{...DEFAULT_CONFIG,depthOffset:10}),0);assert.equal(discAt(100,DEFAULT_CONFIG),null);});
test('schema rejects invalid data and does not inherit arbitrary fields',()=>{const demo=demoSession();assert.equal(validateSession(demo).events.length,25);assert.throws(()=>validateSession({...demo,config:{...DEFAULT_CONFIG,spacing:0}}));assert.throws(()=>validateSession({...demo,events:[sample(1,NaN,0)]}));assert.throws(()=>validateSession({...demo,events:[{type:'click',time:-1}]}));assert.equal(validateSession({...demo,secret:'no'}).secret,undefined);});
test('CSV validates header, numeric values, and explicit contact',()=>{const events=parseMovementCSV('time,angle_deg,depth_mm,contact\n0,170,0,true\n1,-170,0,true');assert.equal(validateSession({...demoSession(),events}).events.length,2);assert.throws(()=>parseMovementCSV('time,angle_deg,depth_mm,contact\n0,0,0,yes'));assert.throws(()=>parseMovementCSV('time,angle_deg,depth_mm,contact\n0,,0,true'));});
test('audio transients remain candidates and silence is empty',()=>{const sr=10000,pcm=new Float32Array(sr);assert.equal(audioTransients(pcm,sr).length,0);pcm.fill(.4,4000,4100);const hits=audioTransients(pcm,sr);assert.equal(hits.length,1);assert.equal(hits[0],.4);});

test('legacy sessions upgrade without inventing gate geometry or initial angles',()=>{const session=validateSession({...demoSession(),config:{...DEFAULT_CONFIG}});assert.equal(session.config.discGeometry.length,8);assert.ok(session.config.discGeometry.every(g=>g.initialAngleDeg===null&&g.trueGate===null&&g.falseGates.length===0));assert.deepEqual(validateSession(JSON.parse(JSON.stringify(session))),session);});
test('configured true/false gate geometry survives session round trip',()=>{const first={initialAngleDeg:350,trueGate:{angleDeg:2,widthDeg:12,depthMm:2},falseGates:[{angleDeg:90,widthDeg:8,depthMm:.5}]};const config=validateConfig({...DEFAULT_CONFIG,discGeometry:Array.from({length:8},(_,i)=>i===0?first:emptyGeometry())});const s=validateSession({...demoSession(),config});assert.deepEqual(validateSession(JSON.parse(JSON.stringify(s))).config.discGeometry[0],first);const state=stateAt([sample(0,0,0),sample(1,30,0)],1,config);assert.equal(state.discs[0].absoluteAngleDeg,20);assert.equal(state.discs[1].absoluteAngleDeg,null);});
test('notch profiles include shallow and deep radial cuts across zero degrees',()=>{const g={initialAngleDeg:null,trueGate:{angleDeg:0,widthDeg:12,depthMm:2.5},falseGates:[{angleDeg:90,widthDeg:8,depthMm:.7}]};const points=discOutline(g,10);assert.equal(points.find(p=>p.angleDeg===0).radiusMm,7.5);assert.equal(points.find(p=>p.angleDeg===90).radiusMm,9.3);assert.equal(points.find(p=>p.angleDeg===180).radiusMm,10);assert.ok(points.every(p=>Number.isFinite(p.radiusMm)));});
test('invalid physical dimensions, overlapping gates and false gate depths are rejected',()=>{const base=validateConfig(DEFAULT_CONFIG);const check=(g)=>validateConfig({...base,discGeometry:[g,...base.discGeometry.slice(1)]});
 assert.throws(()=>validateConfig({...base,thicknessMm:4}),/Thickness/);
 const g={initialAngleDeg:null,trueGate:{angleDeg:0,widthDeg:12,depthMm:2},falseGates:[{angleDeg:355,widthDeg:8,depthMm:.5}]};assert.throws(()=>check(g),/overlap/);
 assert.throws(()=>check({...g,falseGates:[{angleDeg:90,widthDeg:8,depthMm:2}]}),/shallower/);
 assert.throws(()=>check({...g,trueGate:{angleDeg:0,widthDeg:12,depthMm:8},falseGates:[]}),/invalid gate/);
 assert.throws(()=>validateConfig({...base,discGeometry:[]}),/exactly one/);
 assert.throws(()=>check({...g,initialAngleDeg:NaN}),/initial angle/);
});
