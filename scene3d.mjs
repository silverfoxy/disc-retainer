import {gateAlignmentDegrees,withTensionedFirstDisc} from './voice-commands.mjs';
import {discOutline} from './model.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function normal(points){const a=sub(points[1],points[0]),b=sub(points[2],points[0]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n)||1;return n.map(v=>v/length);}
// A point reading has no measured width; keep its schematic notch visible.
const observedGateWidth=(gate,pointWidth)=>gate&&gate.to>gate.from?Math.min(360,(gate.to-gate.from)*gate.degreesPerUnit):pointWidth;
export const sidebarSeatInset=config=>{
 const radius=config.radiusMm*4.7;
 return radius*.25+2-Math.min(.5,radius*.01);
};
export function buildDiscScene(config,state,{exploded=true,axialScale=2,showSidebar=true,illustrativeNotches=false,showHousing=false,showDriveTabs=false,alignHypotheses=false,fromTop=false,showPick=false,pickScale=1,rectangularKeyway=false}={}){
 const R=config.radiusMm*4.7,thickness=config.thicknessMm*4.7*axialScale,gap=config.spacing*4.7*axialScale+(exploded?18:0),extent=(config.discCount-1)*gap+thickness,faces=[],labels=[],marks=[],notches=[],driveTabs=[];
 const coreRotationDeg=state.coreRotationDeg??0;
 const hypotheses=showPick?withTensionedFirstDisc(state.gateHypotheses??Array(config.discCount).fill(null),config.sidebarAngleDeg):state.gateHypotheses;
 const discX=index=>(fromTop?(config.discCount-1)/2-index:index-(config.discCount-1)/2)*gap;
 const face=(points,color,role,disc=null,opacity=1)=>faces.push({points,color,role,disc,opacity,normal:normal(points)});
 for(let i=0;i<config.discCount;i++){
  const x=discX(i),g=config.discGeometry[i],d=state.discs[i],baseOrientation=((g.initialAngleDeg??0)+d.delta+coreRotationDeg)*Math.PI/180,active=state.tool?.contact&&state.engaged===i,hypothesis=hypotheses?.[i];
  const mapped=hypothesis&&hypothesis.degreesPerUnit!==null;
  const alignment=alignHypotheses&&mapped?(d.alignmentRotationDeg??gateAlignmentDegrees(hypothesis,config.sidebarAngleDeg,i===0)):0,orientation=baseOrientation+alignment*Math.PI/180;
  const notchAngle=mapped?((hypothesis.from+hypothesis.to)/2)*hypothesis.degreesPerUnit+alignment+coreRotationDeg:135+coreRotationDeg;
  const observedFalseGates=(state.falseGateHypotheses?.[i]??[]).filter(gate=>gate.degreesPerUnit!==null);
  const displayGeometry=illustrativeNotches?{...g,trueGate:mapped||!observedFalseGates.length?{angleDeg:((notchAngle-orientation*180/Math.PI)%360+360)%360,widthDeg:mapped?observedGateWidth(hypothesis,16):16,depthMm:config.radiusMm*.25}:null,falseGates:observedFalseGates.map(gate=>({angleDeg:(((gate.from+gate.to)/2*gate.degreesPerUnit+alignment+coreRotationDeg-orientation*180/Math.PI)%360+360)%360,widthDeg:observedGateWidth(gate,8),depthMm:config.radiusMm*.10}))}:g;
  if(illustrativeNotches&&displayGeometry.trueGate)notches.push({disc:i,angleDeg:((notchAngle%360)+360)%360,suspected:!!mapped,widthDeg:displayGeometry.trueGate.widthDeg,depthMm:displayGeometry.trueGate.depthMm,illustrative:true});
  if(illustrativeNotches)for(const gate of displayGeometry.falseGates)notches.push({disc:i,angleDeg:((gate.angleDeg+orientation*180/Math.PI)%360+360)%360,suspected:true,falseGate:true,widthDeg:gate.widthDeg,depthMm:gate.depthMm,illustrative:true});
  const corner=Math.atan2(.16,.26)*180/Math.PI;
  const profile=discOutline(displayGeometry,config.radiusMm,rectangularKeyway?[corner,180-corner,180+corner,360-corner]:[]),ring=(side,inner=false)=>profile.map(p=>{const angle=p.angleDeg*Math.PI/180+orientation,r=inner?(rectangularKeyway?Math.min(R*.26/Math.max(1e-12,Math.abs(Math.cos(p.angleDeg*Math.PI/180))),R*.16/Math.max(1e-12,Math.abs(Math.sin(p.angleDeg*Math.PI/180)))):R*.26):p.radiusMm*4.7;return [x+side*thickness/2,r*Math.cos(angle),r*Math.sin(angle)];});
  const near=ring(1),far=ring(-1),innerNear=ring(1,true),innerFar=ring(-1,true),color=hypothesis?[192,137,60]:active?[64,153,151]:d.estimated?[70,119,132]:[107,133,154];
  for(let j=0;j<profile.length;j++){const k=(j+1)%profile.length;
   face([near[j],near[k],innerNear[k],innerNear[j]],color,'disc-face',i);
   face([far[k],far[j],innerFar[j],innerFar[k]],color,'disc-face',i);
   face([near[j],far[j],far[k],near[k]],color,'disc-edge',i);
   face([innerFar[j],innerNear[j],innerNear[k],innerFar[k]],[42,65,84],'bore',i);
  }
  if(showDriveTabs){
   // Generic external lug, shown as part of the disc rather than as another
   // recessed gate. Its offset is illustrative, not model-specific geometry.
   const angle=(illustrativeNotches?notchAngle*Math.PI/180:orientation)+Math.PI;
   const radial=[0,Math.cos(angle),Math.sin(angle)],tangent=[0,-Math.sin(angle),Math.cos(angle)],points=[];
   for(const axial of [-thickness/2,thickness/2])for(const radius of [R-2,R+10])for(const side of [-4,4])points.push(add([x+axial,0,0],add(radial.map(v=>v*radius),tangent.map(v=>v*side))));
   for(const indices of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])face(indices.map(index=>points[index]),hypothesis?[207,157,80]:[160,179,191],'drive-tab',i);
   driveTabs.push({disc:i,angleRad:angle,points});
   if(i===config.discCount-1)labels.push({point:add([x+thickness/2,0,0],radial.map(v=>v*(R+19))),text:'TAB'});
  }
  // Recesses in notebook mode are illustrative. Speech supplies a hypothesis, never a confirmed gate.
  marks.push({point:[x+thickness/2+.2,R*.79*Math.cos(orientation),R*.79*Math.sin(orientation)],color:d.estimated?'#91ffdf':'#d5e2ec',radius:2.2,depthReference:true});
  for(const [gate,color] of [[g.trueGate,'#72f7d0'],...g.falseGates.map(gate=>[gate,'#ffc77f'])])if(gate){const angle=gate.angleDeg*Math.PI/180+orientation,r=(config.radiusMm-gate.depthMm)*4.7;marks.push({point:[x+thickness/2+.25,r*Math.cos(angle),r*Math.sin(angle)],color,radius:2});}
  if(hypothesis){
   // Overlay in the user's tool-reading reference. Never cut a confirmed notch
   // or infer an internal orientation from a spoken observation.
   if(hypothesis.degreesPerUnit!==null){
    const start=hypothesis.from*hypothesis.degreesPerUnit+alignment+coreRotationDeg,end=hypothesis.to*hypothesis.degreesPerUnit+alignment+coreRotationDeg,steps=Math.max(1,Math.ceil(end-start));
    for(let step=0;step<=steps;step++){
     const angle=(start+(end-start)*step/steps)*Math.PI/180;
     marks.push({point:[x+thickness/2+.5,(R+3)*Math.cos(angle),(R+3)*Math.sin(angle)],color:'#ffcd7d',radius:2.5,hypothesis:true});
    }
   }
   labels.push({point:[x,-R-17,0],text:`${hypothesis.from}–${hypothesis.to} ${hypothesis.units}`,hypothesis:true});
  }
  labels.push({point:[x,R+18,0],text:`${i+1}${showPick&&i===0?' T':''}${d.estimated?' Δ':''}`,unknown:g.initialAngleDeg===null});
 }
 const allMapped=hypotheses?.length===config.discCount&&hypotheses.every(g=>g&&g.degreesPerUnit!==null);
 const firstTarget=gateAlignmentDegrees(hypotheses?.[0],config.sidebarAngleDeg,true);
 const frontAtStop=!showPick||Math.abs((state.discs[0]?.alignmentRotationDeg??firstTarget)-firstTarget)<.01;
 const sidebarInset=alignHypotheses?(state.sidebarInset??(allMapped&&frontAtStop?sidebarSeatInset(config):0)):0;
 const trueWidths=notches.filter(notch=>!notch.falseGate).map(notch=>notch.widthDeg);
 const narrowestWidth=trueWidths.length?Math.min(...trueWidths):16;
 const sidebarHalfWidth=alignHypotheses?Math.min(4,R*.75*Math.tan(Math.min(80,narrowestWidth/2)*Math.PI/180)*.8):Math.min(6,R*.1);
 let sidebarLabel=null;
 if(showSidebar){const angle=(config.sidebarAngleDeg+coreRotationDeg)*Math.PI/180,radial=[0,Math.cos(angle),Math.sin(angle)],tangent=[0,-Math.sin(angle),Math.cos(angle)],center=radial.map(v=>v*(R+7-sidebarInset)),points=[];
  for(const x of [-extent/2-12,extent/2+12])for(const radialOffset of [-5,5])for(const tangentOffset of [-sidebarHalfWidth,sidebarHalfWidth])points.push(add([x,center[1],center[2]],add(radial.map(v=>v*radialOffset),tangent.map(v=>v*tangentOffset))));
  for(const indices of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])face(indices.map(i=>points[i]),[200,157,86],'sidebar');
  sidebarLabel={point:add([extent/2+17,center[1],center[2]],radial.map(v=>v*12)),text:'SIDEBAR'};
 }
 let pick=null;
 if(showPick){
  const top=discX(0),depthIndex=Math.max(0,Math.min(config.discCount-1,state.pickDepthIndex??1)),tipX=discX(depthIndex),outside=extent/2+22;
  const tipAngle=((state.pickAngleDeg??0)+coreRotationDeg)*Math.PI/180,tensionAngle=(coreRotationDeg+(alignHypotheses?(state.discs[0]?.alignmentRotationDeg??gateAlignmentDegrees(hypotheses?.[0],config.sidebarAngleDeg,true)):0))*Math.PI/180;
  const externalX=x=>x>outside?outside+(x-outside)*pickScale:x;
  const cylinder=(start,end,radius,color,role,angle=0)=>{
   // Keep the internal rod/nose inside the smallest keyway dimension even
   // when the external tool is exaggerated for display.
   const internal=role==='pick-shaft'||role==='tensioner-nose';
   radius=internal?Math.min(radius,R*(rectangularKeyway?.16:.26)*.65):radius*pickScale;
   start=externalX(start);end=externalX(end);
   const segments=20;
   for(let k=0;k<segments;k++){
    const a=angle+k/segments*Math.PI*2,b=angle+(k+1)/segments*Math.PI*2;
    const p=(x,t)=>[x,radius*Math.cos(t),radius*Math.sin(t)];
    face([p(start,a),p(end,a),p(end,b),p(start,b)],color,role);
   }
   if(role!=='tensioner-grid'){
    face(Array.from({length:segments},(_,k)=>[start,radius*Math.cos(angle-k/segments*Math.PI*2),radius*Math.sin(angle-k/segments*Math.PI*2)]),color,`${role}-cap`);
    face(Array.from({length:segments},(_,k)=>[end,radius*Math.cos(angle+k/segments*Math.PI*2),radius*Math.sin(angle+k/segments*Math.PI*2)]),color,`${role}-cap`);
   }
  };
  const block=(start,end,radialStart,radialEnd,width,angle,color,role)=>{
   const anchor=role==='pick-tip'?tipX:top,componentScale=['tensioner-prong','tensioner-arm','tensioner-bridge','pick-tip'].includes(role)?1:pickScale;
   if(start<=outside&&end<=outside){start=anchor+(start-anchor)*componentScale;end=anchor+(end-anchor)*componentScale;}else{start=externalX(start);end=externalX(end);}
   radialStart*=componentScale;radialEnd*=componentScale;width*=componentScale;
   const radial=[0,Math.cos(angle),Math.sin(angle)],tangent=[0,-Math.sin(angle),Math.cos(angle)],points=[];
   for(const x of [start,end])for(const r of [radialStart,radialEnd])for(const side of [-width/2,width/2])points.push(add([x,0,0],add(radial.map(v=>v*r),tangent.map(v=>v*side))));
   for(const indices of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])face(indices.map(i=>points[i]),color,role);
  };
  // Stationary outer tensioner and two front-disc prongs.
  cylinder(outside,outside+34,9,[55,64,74],'tensioner-body');
  cylinder(top+thickness/2,outside,5.5,[151,171,184],'tensioner-nose');
  const prongWidth=Math.min(3,R*.1),noseRadius=Math.min(5.5,R*(rectangularKeyway?.16:.26)*.65);
  for(const angle of [tensionAngle,tensionAngle+Math.PI]){
   block(top-thickness/2,top+thickness/2+3,R*.16,R*.245,prongWidth,angle,[181,195,202],'tensioner-prong');
   // Two stationary arms run from the front tips back into the tensioner body.
   block(top+thickness/2+1,outside+.5,R*.16,R*.245,prongWidth,angle,[166,182,190],'tensioner-arm');
   // The roots bridge inward to the nose/body even for large disc diameters.
   block(outside-2,outside+1,noseRadius*.75,R*.245,prongWidth,angle,[166,182,190],'tensioner-bridge');
  }
  // Opposed threaded side handles attach to the stationary outer body.
  const screwX=externalX(outside+17);
  const radialCylinder=(angle,start,end,radius,color,role,knurled=false)=>{
   const radial=[0,Math.cos(angle),Math.sin(angle)],tangent=[0,-Math.sin(angle),Math.cos(angle)],segments=20;
   const point=(distance,phase)=>add([screwX+radius*Math.cos(phase),0,0],add(radial.map(v=>v*distance),tangent.map(v=>v*radius*Math.sin(phase))));
   for(let k=0;k<segments;k++){
    const a=k/segments*Math.PI*2,b=(k+1)/segments*Math.PI*2;
    face([point(start,a),point(end,a),point(end,b),point(start,b)],knurled&&k%2?color.map(v=>Math.round(v*.65)):color,role);
   }
   face(Array.from({length:segments},(_,k)=>point(start,-k/segments*Math.PI*2)),color,`${role}-cap`);
   face(Array.from({length:segments},(_,k)=>point(end,k/segments*Math.PI*2)),color,`${role}-cap`);
  };
  for(const angle of [tensionAngle+Math.PI/2,tensionAngle-Math.PI/2]){
   radialCylinder(angle,8.5*pickScale,24*pickScale,2.2*pickScale,[159,177,187],'tensioner-handle-screw');
   for(let thread=11;thread<23;thread+=2)radialCylinder(angle,thread*pickScale,(thread+.6)*pickScale,2.6*pickScale,[99,120,133],'tensioner-handle-thread');
   radialCylinder(angle,24*pickScale,29*pickScale,4.5*pickScale,[100,116,128],'tensioner-handle-head',true);
  }
  // Red reference grid belongs to the stationary tensioner body.
  for(const x of [outside+6,outside+13,outside+20,outside+27])cylinder(x,x+.8,9.25,[192,63,67],'tensioner-grid');
  // Independent shaft, collar and opposed flag tip, driven by spoken poses.
  cylinder(tipX,outside+60,2.2,[194,210,220],'pick-shaft',tipAngle);
  cylinder(outside+37,outside+60,6.5,[37,43,52],'pick-sleeve',tipAngle);
  block(outside+38,outside+59,6.5,7.2,1.5,tipAngle,[230,76,78],'pick-marker');
  // Internal flags fit inside the bore's inscribed circle at every rotation.
  // The enlarged external handle must not scale these into the disc material.
  const tipClearance=R*(rectangularKeyway?.16:.26)*.9;
  const tipHalfWidth=Math.min(1.5,tipClearance*.35),tipReach=Math.sqrt(tipClearance**2-tipHalfWidth**2),tipHalfLength=Math.min(2,thickness*.35);
  for(const angle of [tipAngle,tipAngle+Math.PI])block(tipX-tipHalfLength,tipX+tipHalfLength,0,tipReach,tipHalfWidth*2,angle,[87,226,228],'pick-tip');
  pick={topX:top,tipX,depthIndex,tipAngle,tensionAngle,displayScale:pickScale};
 }
 let housing=null;
 if(showHousing){
  const radius=R+19,inner=radius-2,half=extent/2+20,segments=96;
  const point=(x,r,a)=>[x,r*Math.cos(a),r*Math.sin(a)];
  for(let segment=0;segment<segments;segment++){
   const a=segment/segments*Math.PI*2,b=(segment+1)/segments*Math.PI*2;
   face([point(-half,radius,a),point(half,radius,a),point(half,radius,b),point(-half,radius,b)],[151,204,230],'housing-wall',null,.065);
   for(const x of [-half,half])face([point(x,radius,a),point(x,radius,b),point(x,inner,b),point(x,inner,a)],[180,218,237],'housing-rim',null,.34);
  }
  housing={radius,innerRadius:inner,halfLength:half};
 }
 return {faces,labels,marks,sidebarLabel,R,extent,thickness,gap,notches,housing,driveTabs,sidebarInset,sidebarHalfWidth,pick,discPositions:Array.from({length:config.discCount},(_,i)=>discX(i))};
}
export function drawDiscScene(ctx,w,h,config,state,view){
 const scene=buildDiscScene(config,state,view),{yaw,pitch,zoom}=view;
 ctx.clearRect(0,0,w,h);
 let scale=Math.min(w/(scene.extent+scene.R*2+(view.showPick?220:90)),h/(scene.R*2+95+Math.abs((scene.extent+(view.showPick?110:0))*Math.sin(yaw)*Math.sin(pitch))*1.2))*zoom;
 const focal=(scene.extent+scene.R*4+100)*2.5;
 const camera=point=>{const [x,y,z]=point,X=x*Math.cos(yaw)+z*Math.sin(yaw),Z=-x*Math.sin(yaw)+z*Math.cos(yaw),Y=y*Math.cos(pitch)-Z*Math.sin(pitch),depth=Z*Math.cos(pitch)+y*Math.sin(pitch),perspective=focal/(focal-depth);return [X*perspective,Y*perspective,depth];};
 let centerX=0,centerY=0;
 if(view.fitToViewport){
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const face of scene.faces)for(const point of face.points){const [x,y]=camera(point);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  scale=Math.min((w-32)/(right-left),(h-84)/(bottom-top))*zoom;
  centerX=(left+right)/2;centerY=(top+bottom)/2;
 }
 const project=point=>{const [x,y,depth]=camera(point);return [w/2+(x-centerX)*scale,h/2+(view.fitToViewport?8:0)+(y-centerY)*scale,depth];};
 const light=[.36,-.48,.8];
 // Long faces cannot be depth-sorted reliably by a single center point.
 // Subdivide the straight sidebar along the axis, including every disc face,
 // while retaining shared edges so sketch strokes do not show the subdivisions.
 const axialStart=-scene.extent/2-12,axialEnd=scene.extent/2+12;
 const cuts=[axialStart,axialEnd,...scene.discPositions.flatMap(x=>[x-scene.thickness/2,x+scene.thickness/2])];
 const sections=Math.ceil((axialEnd-axialStart)/Math.max(2,scene.thickness/2));
 for(let i=1;i<sections;i++)cuts.push(axialStart+(axialEnd-axialStart)*i/sections);
 const boundaries=[...new Set(cuts)].sort((a,b)=>a-b);
 const renderFaces=scene.faces.flatMap(face=>{
  if(face.role!=='sidebar')return [face];
  const low=Math.min(...face.points.map(p=>p[0])),high=Math.max(...face.points.map(p=>p[0]));
  if(high-low<1e-8)return [face];
  return boundaries.slice(0,-1).map((start,i)=>({...face,points:face.points.map(p=>[Math.abs(p[0]-low)<1e-8?start:boundaries[i+1],p[1],p[2]])}));
 });
 const surfaces=renderFaces.map(face=>({...face,projected:face.points.map(project)})).sort((a,b)=>a.projected.reduce((s,p)=>s+p[2],0)/a.points.length-b.projected.reduce((s,p)=>s+p[2],0)/b.points.length);
 // Outline actual creases and silhouettes, omitting coplanar tessellation seams.
 const edgeKey=(a,b)=>[a,b].map(point=>point.map(v=>v.toFixed(5)).join(',')).sort().join('|');
 const edges=new Map();
 if(view.sketch)for(const face of surfaces){
  const p=face.projected;face.facing=Math.sign(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0));
  face.points.forEach((point,i)=>{const key=edgeKey(point,face.points[(i+1)%face.points.length]);if(!edges.has(key))edges.set(key,[]);edges.get(key).push(face);});
 }
 for(const face of surfaces){
  const illumination=.28+.72*Math.max(0,dot(face.normal,light));
  let color=face.color.map(v=>Math.round(v*illumination));
  if(view.sketch){
   const paper=248-Math.round((1-illumination)*24);
   const amber=face.role==='sidebar'||(face.disc!==null&&(face.disc===0&&view.showPick||state.gateHypotheses?.[face.disc]));
   color=face.role==='pick-tip'?[170,221,218]:face.role==='pick-marker'||face.role==='tensioner-grid'?[210,175,172]:amber?[paper,Math.round(paper*.96),Math.round(paper*.87)]:[paper,paper,paper];
  }
  ctx.beginPath();face.projected.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.globalAlpha=face.opacity;ctx.fillStyle=`rgb(${color.join(',')})`;ctx.fill();
  if(view.sketch){
   ctx.strokeStyle=face.role.startsWith('housing-')?'#75838d':'#46515a';ctx.lineWidth=.75;
   // Keep the transparent cylinder legible without obscuring the disc stack.
   ctx.globalAlpha=face.role.startsWith('housing-')?.24:.8;
   ctx.beginPath();face.points.forEach((point,i)=>{
    const adjacent=edges.get(edgeKey(point,face.points[(i+1)%face.points.length]));
    if(adjacent.length===1||adjacent.some(other=>other!==face&&(Math.abs(dot(face.normal,other.normal))<.92||face.facing!==other.facing))){const a=face.projected[i],b=face.projected[(i+1)%face.points.length];ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
   });ctx.stroke();
  }else if(face.role!=='disc-face'&&!face.role.startsWith('housing-')){ctx.strokeStyle='rgba(10,22,33,.16)';ctx.lineWidth=.35;ctx.stroke();}
 }

 ctx.globalAlpha=1;
 // Reference markers are drawn only on the near axial face; small labels remain readable in exploded view.
 for(const mark of scene.marks){const p=project(mark.point);ctx.beginPath();ctx.arc(p[0],p[1],mark.radius,0,Math.PI*2);ctx.fillStyle=view.sketch?(mark.hypothesis?'#b47a27':mark.depthReference?'#70818d':'#16877b'):mark.color;ctx.fill();}
 ctx.font='10px system-ui';ctx.textAlign='center';for(const label of scene.labels){const p=project(label.point);ctx.fillStyle=view.lightTheme?(label.hypothesis?'#8a530c':label.unknown?'#596875':'#263a4a'):(label.hypothesis?'#ffcd7d':label.unknown?'#a8bac9':'#d5e6f1');ctx.fillText(label.text,p[0],p[1]);}
 if(scene.sidebarLabel){const p=project(scene.sidebarLabel.point);ctx.font='8px system-ui';ctx.fillStyle=view.lightTheme?'#80520e':'#f4cf8a';ctx.fillText(scene.sidebarLabel.text,p[0],p[1]);}
 const partial=Number.isFinite(state.partialDepth);if(state.tool||partial){const index=state.tool?state.engaged:Math.round((state.partialDepth-config.depthOffset)/config.spacing),x=index===null?-scene.extent/2-15:(index-(config.discCount-1)/2)*scene.gap,p=project([x,0,0]);ctx.beginPath();ctx.arc(p[0],p[1],6,0,Math.PI*2);ctx.strokeStyle=state.tool?'#f4bc72':'#94a9ba';ctx.lineWidth=2;ctx.stroke();}
 ctx.textAlign='left';ctx.fillStyle=view.lightTheme?'#52616c':'#a8bbca';ctx.font='9px system-ui';ctx.fillText(view.voiceOnly?'ILLUSTRATIVE NOTCHES · SUSPECTED GATE RANGES':'CONFIGURED GEOMETRY · ESTIMATED MOTION',14,20);
 if(!view.voiceOnly)ctx.fillText(`${view.axialScale}× axial display scale · physical dimensions unchanged`,14,h-12);
}
