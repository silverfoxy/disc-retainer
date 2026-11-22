import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,DEFAULT_CONFIG,stateAt} from './model.mjs';
import {buildDiscScene} from './scene3d.mjs';
const config=validateConfig(DEFAULT_CONFIG);
const state=stateAt([],0,config);
test('solid discs have distinct caps, outer walls and an open bore',()=>{
 const scene=buildDiscScene(config,state,{axialScale:1});
 const faces=scene.faces.filter(f=>f.disc===0);
 const caps=faces.filter(f=>f.role==='disc-face');
 assert.equal(new Set(caps.map(f=>f.points[0][0])).size,2);
 for(const role of ['disc-edge','bore'])assert.ok(faces.some(f=>f.role===role));
 assert.ok(caps.every(f=>f.points.every(p=>Math.hypot(p[1],p[2])>=scene.R*.26-1e-8)));
 assert.ok(faces.every(f=>f.points.flat().every(Number.isFinite)));
});
test('display exaggeration scales thickness and spacing without changing measurements or state',()=>{
 const before=JSON.stringify({config,state});
 const one=buildDiscScene(config,state,{axialScale:1,exploded:false});
 const three=buildDiscScene(config,state,{axialScale:3,exploded:false});
 assert.equal(three.thickness,one.thickness*3);assert.equal(three.gap,one.gap*3);
 assert.equal(JSON.stringify({config,state}),before);
 assert.deepEqual(three.labels.map(label=>label.text),Array.from({length:config.discCount},(_,i)=>String(i+1)));
});
test('sidebar is a six-face solid that respects its configured angle and visibility',()=>{
 const a=buildDiscScene(config,state),b=buildDiscScene({...config,sidebarAngleDeg:90},state);
 assert.equal(a.faces.filter(f=>f.role==='sidebar').length,6);
 assert.ok(a.sidebarLabel.point[1]>a.R);assert.ok(Math.abs(a.sidebarLabel.point[2])<1e-8);
 assert.ok(b.sidebarLabel.point[2]>b.R);assert.ok(Math.abs(b.sidebarLabel.point[1])<1e-8);
 const hidden=buildDiscScene(config,state,{showSidebar:false});
 assert.equal(hidden.sidebarLabel,null);assert.ok(hidden.faces.every(f=>f.role!=='sidebar'));
});
test('notebook recesses follow hypotheses without changing true-gate configuration',()=>{
 const before=JSON.stringify({config,state});
 const hypotheses=Array(config.discCount).fill(null);hypotheses[1]={from:1,to:2,degreesPerUnit:45};
 const scene=buildDiscScene(config,{...state,gateHypotheses:hypotheses},{illustrativeNotches:true});
 assert.equal(scene.notches.length,config.discCount);
 assert.equal(scene.notches[1].angleDeg,67.5);
 assert.equal(scene.notches[1].suspected,true);
 const outer=scene.faces.filter(f=>f.role==='disc-edge'&&f.disc===1).flatMap(f=>f.points);
 assert.ok(outer.some(p=>Math.hypot(p[1],p[2])<scene.R*.8));
 assert.ok(outer.some(p=>Math.abs(Math.hypot(p[1],p[2])-scene.R)<1e-6));
 assert.equal(JSON.stringify({config,state}),before);
});
test('transparent housing encloses discs and sidebar with an open central passage',()=>{
 const scene=buildDiscScene(config,state,{showHousing:true});
 const glass=scene.faces.filter(f=>f.role.startsWith('housing-'));
 assert.ok(glass.length>0&&glass.every(f=>f.opacity>0&&f.opacity<1));
 const enclosed=scene.faces.filter(f=>!f.role.startsWith('housing-')).flatMap(f=>f.points);
 assert.ok(enclosed.every(p=>Math.abs(p[0])<scene.housing.halfLength&&Math.hypot(p[1],p[2])<scene.housing.innerRadius));
 assert.ok(glass.every(f=>f.points.every(p=>Math.hypot(p[1],p[2])>=scene.housing.innerRadius-1e-6)));
});
test('midpoint alignment rotates the disc and drops the sidebar only for a complete stack',()=>{
 const hypotheses=Array(config.discCount).fill(null);hypotheses[1]={from:2,to:3.5,degreesPerUnit:45};
 const partial=buildDiscScene(config,{...state,gateHypotheses:hypotheses},{illustrativeNotches:true,alignHypotheses:true});
 assert.equal(partial.notches[1].angleDeg,0);
 assert.equal(partial.sidebarInset,0);
 const complete=buildDiscScene(config,{...state,gateHypotheses:hypotheses.map(()=>({from:2,to:3.5,degreesPerUnit:45}))},{illustrativeNotches:true,alignHypotheses:true});
 assert.ok(complete.notches.every(notch=>notch.angleDeg===0));
 assert.ok(complete.sidebarInset>0);
 // The disc's reference mark moves with the body, not just its gate geometry.
 const mark=partial.marks.filter(mark=>mark.depthReference)[1];
 assert.ok(Math.abs(Math.atan2(mark.point[2],mark.point[1])*180/Math.PI-(-123.75))<1e-8);
});
test('top numbering and independent pick components follow the insertion end',()=>{
 const pose={...state,pickDepthIndex:3,pickAngleDeg:45};
 const scene=buildDiscScene(config,pose,{fromTop:true,showPick:true,showHousing:true});
 assert.ok(scene.discPositions[0]>scene.discPositions.at(-1));
 assert.equal(scene.pick.tipX,scene.discPositions[3]);
 assert.equal(scene.pick.topX,scene.discPositions[0]);
 assert.ok(Math.abs(scene.pick.tipAngle-Math.PI/4)<1e-8);
 assert.equal(scene.pick.tensionAngle,0);
 for(const role of ['tensioner-body','tensioner-prong','pick-shaft','pick-sleeve','pick-tip'])assert.ok(scene.faces.some(f=>f.role===role));
 const other=buildDiscScene(config,{...pose,pickDepthIndex:5,pickAngleDeg:90},{fromTop:true,showPick:true});
 assert.equal(other.pick.tipX,other.discPositions[5]);
 assert.deepEqual(scene.faces.filter(f=>f.role==='tensioner-prong'),other.faces.filter(f=>f.role==='tensioner-prong'));
});
test('the tensioned front disc requires no gate annotation for sidebar retraction',()=>{
 const pair=validateConfig({...DEFAULT_CONFIG,discCount:2});const pose=stateAt([],0,pair);
 pose.gateHypotheses=[null,{from:2,to:3.5,degreesPerUnit:45}];
 const scene=buildDiscScene(pair,pose,{showPick:true,fromTop:true,illustrativeNotches:true,alignHypotheses:true});
 assert.ok(scene.notches.every(notch=>notch.angleDeg===0));
 assert.ok(scene.sidebarInset>0);
 assert.equal(pose.gateHypotheses[0],null);
});
test('enlarging the pick keeps its central rod and nose within rectangular keyway clearance',()=>{
 const scene=buildDiscScene(config,state,{showPick:true,pickScale:3,rectangularKeyway:true,fromTop:true});
 const internal=scene.faces.filter(f=>['pick-shaft','tensioner-nose'].includes(f.role));
 assert.ok(internal.length>0);
 assert.ok(internal.every(f=>f.points.every(p=>Math.hypot(p[1],p[2])<scene.R*.16)));
});

test('false gate observations cut smaller notches and rotate with the disc without aligning sidebar',()=>{
 const before=JSON.stringify(config),gateHypotheses=Array(8).fill(null),falseGateHypotheses=Array.from({length:8},()=>[]);
 falseGateHypotheses[2]=[{from:2,to:2,degreesPerUnit:45}];
 const view={illustrativeNotches:true,alignHypotheses:true};
 let scene=buildDiscScene(config,{...state,gateHypotheses,falseGateHypotheses},view);
 let notch=scene.notches.find(n=>n.falseGate);
 assert.equal(notch.disc,2);assert.equal(notch.angleDeg,90);assert.equal(notch.widthDeg,8);assert.equal(notch.depthMm,config.radiusMm*.1);
 assert.equal(scene.sidebarInset,0);
 const radii=scene.faces.filter(f=>f.role==='disc-edge'&&f.disc===2).flatMap(f=>f.points.map(p=>Math.hypot(p[1],p[2])));
 assert.ok(radii.some(r=>Math.abs(r-scene.R*.9)<1e-6));
 gateHypotheses[2]={from:1,to:1,degreesPerUnit:45};
 scene=buildDiscScene(config,{...state,gateHypotheses,falseGateHypotheses},view);
 notch=scene.notches.find(n=>n.falseGate);assert.equal(notch.angleDeg,45);assert.equal(scene.sidebarInset,0);
 assert.equal(JSON.stringify(config),before);
});

test('an unknown generic main notch cannot mask a false gate at the same angle',()=>{
 const falseGateHypotheses=Array.from({length:8},()=>[]);falseGateHypotheses[2]=[{from:3,to:3,degreesPerUnit:45}];
 const scene=buildDiscScene(config,{...state,falseGateHypotheses},{illustrativeNotches:true});
 const notches=scene.notches.filter(n=>n.disc===2);assert.equal(notches.length,1);assert.equal(notches[0].falseGate,true);
 const radii=scene.faces.filter(f=>f.role==='disc-edge'&&f.disc===2).flatMap(f=>f.points.map(p=>Math.hypot(p[1],p[2])));
 assert.ok(radii.every(r=>r>=scene.R*.9-1e-6));
});

test('entered ranges determine actual true and false notch widths including wrapped ranges',()=>{
 for(const [from,to,width] of [[2,2.5,22.5],[2,3.5,67.5],[7.5,8.5,45],[0,8,360]]){
  const gateHypotheses=Array(8).fill(null),falseGateHypotheses=Array.from({length:8},()=>[]);
  gateHypotheses[2]={from,to,degreesPerUnit:45};
  falseGateHypotheses[3]=[{from,to,degreesPerUnit:45}];
  const scene=buildDiscScene(config,{...state,gateHypotheses,falseGateHypotheses},{illustrativeNotches:true,alignHypotheses:true});
  assert.equal(scene.notches.find(n=>n.disc===2).widthDeg,width);
  assert.equal(scene.notches.find(n=>n.disc===3&&n.falseGate).widthDeg,width);
  const cut=scene.faces.filter(f=>f.role==='disc-edge'&&f.disc===2).flatMap(f=>f.points).filter(p=>Math.abs(Math.hypot(p[1],p[2])-scene.R*.75)<1e-6);
  assert.ok(cut.length>0);
  if(width<360){
   const maxAngle=Math.max(...cut.map(p=>Math.abs(Math.atan2(p[2],p[1])*180/Math.PI)));
   assert.ok(Math.abs(maxAngle-width/2)<.001,`Cut edge ${maxAngle} should reach half width ${width/2}`);
  }else{
   const points=scene.faces.filter(f=>f.role==='disc-edge'&&f.disc===2).flatMap(f=>f.points);
   assert.ok(points.every(p=>Math.abs(Math.hypot(p[1],p[2])-scene.R*.75)<1e-6));
  }
 }
});
test('point-only readings retain visible schematic widths instead of inventing a measured range',()=>{
 const gateHypotheses=Array(8).fill(null),falseGateHypotheses=Array.from({length:8},()=>[]);
 gateHypotheses[2]={from:2,to:2,degreesPerUnit:45};falseGateHypotheses[3]=[{from:4,to:4,degreesPerUnit:45}];
 const scene=buildDiscScene(config,{...state,gateHypotheses,falseGateHypotheses},{illustrativeNotches:true});
 assert.equal(scene.notches.find(n=>n.disc===2).widthDeg,16);assert.equal(scene.notches.find(n=>n.disc===3).widthDeg,8);
});


test('blue picking tip stays inside the center hole at all rotations and external display scales',()=>{
 for(const radiusMm of [2,10,50])for(const rectangularKeyway of [true,false])for(const pickScale of [1,3,6]){
  const c=validateConfig({...DEFAULT_CONFIG,discCount:2,radiusMm,thicknessMm:.1});
  for(const pickAngleDeg of [0,22.5,45,90,135,180,270]){
   const pose={...stateAt([],0,c),pickAngleDeg,pickDepthIndex:1};
   const scene=buildDiscScene(c,pose,{showPick:true,rectangularKeyway,pickScale,fromTop:true});
   const tips=scene.faces.filter(face=>face.role==='pick-tip');assert.equal(tips.length,12);
   for(const face of tips)for(const point of face.points){
    assert.ok(Math.hypot(point[1],point[2])<scene.R*(rectangularKeyway?.16:.26));
    assert.ok(Math.abs(point[0]-scene.pick.tipX)<scene.thickness/2);
   }
  }
 }
 const a=buildDiscScene(config,state,{showPick:true,rectangularKeyway:true,pickScale:1});
 const b=buildDiscScene(config,state,{showPick:true,rectangularKeyway:true,pickScale:3});
 assert.deepEqual(a.faces.filter(f=>f.role==='pick-tip'),b.faces.filter(f=>f.role==='pick-tip'));
 assert.notDeepEqual(a.faces.filter(f=>f.role==='tensioner-body'),b.faces.filter(f=>f.role==='tensioner-body'));
});


test('both tensioning tips have continuous stationary arms and roots connected to the pick body',()=>{
 for(const radiusMm of [2,10,50])for(const pickScale of [1,3]){
  const c=validateConfig({...DEFAULT_CONFIG,radiusMm});
  const scene=buildDiscScene(c,stateAt([],0,c),{showPick:true,pickScale,rectangularKeyway:true,fromTop:true});
  const bounds=(role,side)=>{
   const points=scene.faces.filter(f=>f.role===role).flatMap(f=>f.points).filter(p=>Math.sign(p[1])===side);
   assert.ok(points.length);return {minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minR:Math.min(...points.map(p=>Math.abs(p[1]))),maxR:Math.max(...points.map(p=>Math.abs(p[1])))};
  };
  const body=scene.faces.filter(f=>f.role==='tensioner-body').flatMap(f=>f.points),bodyStart=Math.min(...body.map(p=>p[0])),bodyEnd=Math.max(...body.map(p=>p[0]));
  for(const side of [-1,1]){
   const tip=bounds('tensioner-prong',side),arm=bounds('tensioner-arm',side),root=bounds('tensioner-bridge',side);
   assert.ok(arm.minX<tip.maxX&&arm.minX>tip.minX);
   assert.equal(tip.minR,arm.minR);assert.equal(tip.maxR,arm.maxR);
   assert.ok(root.minX<arm.maxX&&root.maxX>arm.minX);
   assert.ok(root.minR<arm.minR&&root.maxR>=arm.maxR);
   assert.ok(root.maxX>bodyStart&&root.minX<bodyEnd);
   assert.ok(Math.hypot(root.minR,Math.min(3,scene.R*.1)/2)<9*pickScale);
  }
  const moved=buildDiscScene(c,{...stateAt([],0,c),pickAngleDeg:90,pickDepthIndex:4},{showPick:true,pickScale,rectangularKeyway:true,fromTop:true});
  for(const role of ['tensioner-prong','tensioner-arm','tensioner-bridge'])assert.deepEqual(scene.faces.filter(f=>f.role===role),moved.faces.filter(f=>f.role===role));
 }
});

test('opening turns the disc stack, sidebar and tool together inside a stationary housing',()=>{
 const pose={...state,gateHypotheses:Array.from({length:8},()=>({from:2,to:3,degreesPerUnit:45})),sidebarInset:10};
 const view={showPick:true,showHousing:true,illustrativeNotches:true,alignHypotheses:true,fromTop:true,rectangularKeyway:true};
 const before=buildDiscScene(config,pose,view),opened=buildDiscScene(config,{...pose,coreRotationDeg:90},view);
 const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
 for(const role of ['disc-face','sidebar','pick-tip','tensioner-prong','tensioner-arm','tensioner-bridge','tensioner-handle-screw']){
  const a=before.faces.filter(face=>face.role===role),b=opened.faces.filter(face=>face.role===role);assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++)for(let j=0;j<a[i].points.length;j++){
   const original=a[i].points[j],rotated=b[i].points[j];close(rotated[0],original[0]);close(rotated[1],-original[2]);close(rotated[2],original[1]);
  }
 }
 assert.deepEqual(before.faces.filter(f=>f.role.startsWith('housing-')),opened.faces.filter(f=>f.role.startsWith('housing-')));
 assert.ok(opened.notches.every(notch=>Math.abs(notch.angleDeg-90)<1e-7));
});

test('seated sidebar stays parallel to the core and fits every gate through the opening turn',async()=>{
 const {sidebarSeatInset}=await import('./scene3d.mjs');
 for(const radiusMm of [2,10,50])for(const coreRotationDeg of [0,37,90]){
  const c=validateConfig({...DEFAULT_CONFIG,radiusMm});
  const gates=Array.from({length:8},(_,i)=>({from:i,to:i+(i===3?.01:i===5?.1:.5),degreesPerUnit:45}));
  const scene=buildDiscScene(c,{...stateAt([],0,c),gateHypotheses:gates,coreRotationDeg,sidebarInset:sidebarSeatInset(c)},{showPick:true,fromTop:true,illustrativeNotches:true,alignHypotheses:true});
  const angle=(c.sidebarAngleDeg+coreRotationDeg)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const points=scene.faces.filter(face=>face.role==='sidebar').flatMap(face=>face.points);
  const local=points.map(([x,y,z])=>({x,radial:y*cos+z*sin,tangent:-y*sin+z*cos}));
  const ends=[Math.min(...local.map(p=>p.x)),Math.max(...local.map(p=>p.x))];
  for(const end of ends){
   const crossSection=local.filter(p=>Math.abs(p.x-end)<1e-8).map(p=>[p.radial,p.tangent]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
   const other=local.filter(p=>Math.abs(p.x-ends.find(x=>x!==end))<1e-8).map(p=>[p.radial,p.tangent]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
   assert.deepEqual(crossSection,other);
  }
  const widths=scene.notches.filter(notch=>!notch.falseGate).map(notch=>notch.widthDeg);
  for(const point of local){
   assert.ok(point.radial>scene.R*.75,'sidebar must clear the notch floor');
   const offset=Math.abs(Math.atan2(point.tangent,point.radial))*180/Math.PI;
   assert.ok(widths.every(width=>offset<width/2),'sidebar must fit the narrowest gate');
  }
  assert.ok(scene.sidebarHalfWidth<4,'narrow gate should reduce the bar width');
 }
});

test('editable disc 1 gate turns with the tensioner and aligns with the sidebar',()=>{
 const c=validateConfig({...DEFAULT_CONFIG,discCount:2});
 const gates=[{from:5,to:5.5,degreesPerUnit:45},{from:2,to:2.5,degreesPerUnit:45}];
 const pose={...stateAt([],0,c),gateHypotheses:gates,pickDepthIndex:1,pickAngleDeg:-101.25};
 pose.discs[0].alignmentRotationDeg=-236.25;pose.discs[1].alignmentRotationDeg=-101.25;
 const scene=buildDiscScene(c,pose,{showPick:true,rectangularKeyway:true,fromTop:true,alignHypotheses:true,illustrativeNotches:true});
 assert.ok(scene.notches.every(notch=>Math.abs(notch.angleDeg)<1e-8));assert.ok(scene.sidebarInset>0);
 assert.equal(scene.pick.tensionAngle,-236.25*Math.PI/180);assert.equal(scene.pick.tipAngle,-101.25*Math.PI/180);
 const unaligned=buildDiscScene(c,{...pose,discs:[{...pose.discs[0],alignmentRotationDeg:0},pose.discs[1]]},{showPick:true,alignHypotheses:true,illustrativeNotches:true});
 assert.equal(unaligned.sidebarInset,0);
 const firstTip=buildDiscScene(c,{...pose,pickDepthIndex:0},{showPick:true,fromTop:true});assert.equal(firstTip.pick.tipX,firstTip.discPositions[0]);
});
