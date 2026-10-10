import {CONVEYOR} from './conveyor';
import {cellPose} from './layout';
import type {Pallet,Vec3} from '../types';
import type {RelayWorld,RelayMotion,RelayBox} from './types';

// Dedicated demonstration only. Local pallet frames and pickup TCPs stay unchanged.
export const usesHub=(p:Pallet)=>p.conveyorDistribution==='hub';
export const HUB={x:0,y:-3200,inletY:-6200,length:3000} as const;
export const hubMainPoint=(arc:number):Vec3=>({x:0,y:HUB.inletY+Math.min(HUB.length,arc),z:CONVEYOR.deck});
export function hubRoute(p:Pallet,robot:number){return [hubMainPoint(HUB.length),{x:cellPose(robot,p).x,y:-1100,z:CONVEYOR.deck},{x:cellPose(robot,p).x,y:CONVEYOR.front,z:CONVEYOR.deck}];}
export function hubLength(p:Pallet,robot:number){const [a,b,c]=hubRoute(p,robot);return Math.hypot(b.x-a.x,b.y-a.y)+Math.hypot(c.x-b.x,c.y-b.y);}
// The existing branch queue uses 0..2000 logical coordinates; movement uses actual path length.
export function hubBranchPoint(p:Pallet,robot:number,arc:number):Vec3{const [a,b,c]=hubRoute(p,robot),first=Math.hypot(b.x-a.x,b.y-a.y),d=Math.max(0,Math.min(2000,arc))/2000*hubLength(p,robot);const from=d<=first?a:b,to=d<=first?b:c,u=d<=first?d/first:(d-first)/(hubLength(p,robot)-first);return {x:from.x+(to.x-from.x)*u,y:from.y+(to.y-from.y)*u,z:CONVEYOR.deck};}
const radius=(b:RelayBox)=>Math.hypot(b.observation.size.w,b.observation.size.d)/2;
const position=(b:RelayBox,p:Pallet)=>{const t=b.flow!.transport!;return t.kind==='main'?hubMainPoint(t.arc):hubBranchPoint(p,t.robot!,t.arc);};
export function advanceHub(w:RelayWorld,motions:RelayMotion[],p:Pallet,previousTime:number,liftSpeed:number){
 const time=w.time,travel=(time-previousTime)*w.stream!.speed;
 const active=w.boxes.filter(b=>b.flow?.transport&&(b.status==='belt'||b.status==='reserved'&&motions.some(m=>m.action.boxId===b.observation.id&&time<m.action.tracking!.graspAt+(b.observation.size.h+100)/liftSpeed)));
 // Advance leaders first. Shared hub and adjacent fan lanes use conservative bounding-circle clearance.
 const branches=active.filter(b=>b.flow!.transport!.kind==='branch').sort((a,b)=>b.flow!.transport!.arc-a.flow!.transport!.arc);
 for(const b of branches){const t=b.flow!.transport!;let goal=b.status==='reserved'?t.arc:Math.min(2000,t.arc+travel*2000/hubLength(p,t.robot!));
  const clear=(arc:number)=>{const pt=hubBranchPoint(p,t.robot!,arc);return active.every(q=>q===b||q.flow!.transport!.kind==='main'&&q.flow!.transport!.arc<HUB.length-radius(b)-radius(q)-100||Math.hypot(pt.x-position(q,p).x,pt.y-position(q,p).y)>=radius(b)+radius(q)+100-1e-6);};
  if(!clear(goal)){let lo=t.arc,hi=goal;for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(clear(mid))lo=mid;else hi=mid;}goal=lo;}
  t.arc=goal;t.limit=goal;t.at=time;if(goal>=2000-.01)t.waitingSince??=time;
 }
 let ahead:RelayBox|undefined;
 const main=[...active.filter(b=>b.flow!.transport!.kind==='main'),...w.boxes.filter(b=>b.status==='rejecting'&&b.flow?.reject&&time-b.flow.reject.startedAt<2.5)].sort((a,b)=>b.flow!.transport!.arc-a.flow!.transport!.arc);
 for(const b of main){const t=b.flow!.transport!;if(b.status==='rejecting'){t.limit=t.arc;t.at=time;ahead=b;continue;}let limit=Math.min(HUB.length,ahead?ahead.flow!.transport!.arc-radius(ahead)-radius(b)-100:Infinity);
  if(!b.scan)limit=Math.min(limit,650+b.observation.size.w/2);
  else if(b.scan.verdict==='damaged')limit=Math.min(limit,1500);
  else if(t.robot===undefined)limit=Math.min(limit,HUB.length);
  let goal=Math.max(t.arc,Math.min(limit,t.arc+travel));
  const clear=(arc:number)=>{const pt=hubMainPoint(arc);return branches.every(q=>Math.hypot(pt.x-position(q,p).x,pt.y-position(q,p).y)>=radius(b)+radius(q)+100-1e-6);};
  if(!clear(goal)){let lo=t.arc,hi=goal;for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(clear(mid))lo=mid;else hi=mid;}goal=lo;}
  t.arc=goal;t.limit=goal;t.at=time;
  if(b.scan?.verdict==='damaged'&&goal>=1500-.01&&!w.boxes.some(q=>q.status==='rejecting')){b.status='rejecting';b.flow!.reject={startedAt:time,from:hubMainPoint(goal)};w.revision++;}
  else if(t.robot!==undefined&&goal>=HUB.length-.01){t.kind='branch';t.arc=0;t.limit=0;t.waitingSince=undefined;b.flow!.lastReason=`중앙 분배 허브 → R${t.robot+1} 직행`;branches.push(b);w.revision++;}
  ahead=b.flow!.transport!.kind==='main'?b:{...b,flow:{...b.flow!,transport:{...t,kind:'main',arc:HUB.length}}};
 }
}
