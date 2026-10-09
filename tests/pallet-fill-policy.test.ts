import {it,expect} from 'vitest';
import {streamInventory} from '../src/pallet/relay/streamInventory';
import {withFleet} from '../src/pallet/relay/fleet';
import {createStream,advanceStream,applyDecision} from '../src/pallet/relay/streamEngine';
import {observedProblem,planStream} from '../src/pallet/relay/streamPlanner';
import {stopArc,footprint,atRollerPickup} from '../src/pallet/relay/rollerQueue';
import {inspectConstraints} from '../src/pallet/constraints';
import {receiveConstraints,inspectRollerMotion} from '../src/pallet/relay/motion';
import {applyStreamSettings,streamSettings,tallStackProfile} from '../src/pallet/relay/streamSettings';

function fixture(){
 const s=withFleet(streamInventory(42,8),{count:1,architecture:'floor'});
 s.pallet={...s.pallet,conveyorMode:'straight',palletsPerRobot:1,width:320,depth:270,maxHeight:600};
 s.constraints.heavyRule='off';
 s.types.forEach(t=>{t.size={w:320,d:270,h:180};t.weight=3;t.maxLoadKg=150;t.orientations=[0,90];t.handling=undefined;});
 const w=createStream(s);w.time=100;w.stream!.inputClosed=true;
 const [placed,head,follower]=w.boxes;
 const p={id:placed.observation.id,typeId:placed.observation.typeId,size:placed.observation.size,weight:3,orientation:0 as const,position:{x:0,y:0,z:0},supports:[],supportRatio:1,loadAbove:0};
 const valid=inspectConstraints(p,placed.observation,[],s.pallet,{...receiveConstraints(s),robotMode:'ideal'});
 expect(valid.reasons).toEqual([]);w.cells[0].placements=valid.stack;placed.status='placed';
 w.boxes.slice(3).forEach(b=>b.status='outfeed');
 head.observation.size.h=500;follower.observation.size.h=100;
 for(const b of [head,follower]){b.status='belt';b.flow={enteredAt:0,measuredAt:0,passes:0,lastReason:'',checks:{},roller:{arc:stopArc(b,s.pallet),limit:stopArc(b,s.pallet),at:100,attempts:0,waitingSince:0}};}
 follower.flow!.roller!.arc-=footprint(head)+100;follower.flow!.roller!.limit=follower.flow!.roller!.arc;
 return {s,w,head,follower};
}
it('keeps a one-carton pallet when the head fails and a stopped follower is untested',()=>{
 const {s,w,head}=fixture();head.flow!.roller!.attempts=2;w.stream!.cells[0].rejected=[head.observation.id];
 head.flow!.checks[0]={version:0,at:90,reason:'높이 초과',blocked:0,tested:0};
 const r=advanceStream(s,w,[],100);
 expect(r.world.stream!.cells[0].phase).toBe('loading');
 expect(r.world.boxes[1].status).toBe('belt');
 expect(r.world.cells[0].placements).toHaveLength(1);
});
it('picks a feasible stopped follower after rejecting the head without exchanging the pallet',()=>{
 const {s,w,follower}=fixture();expect(atRollerPickup(follower,s.pallet)).toBe(true);
 const obs=observedProblem(s,w),d=planStream(obs.scenario,obs.world),r=applyDecision(s,w,[],d);
 expect(r.motions.map(m=>m.action.boxId),JSON.stringify(d.proposals.map(p=>({id:p.boxId,reason:p.reason,c:p.candidates.length,check:r.world.boxes.find(b=>b.observation.id===p.boxId)?.flow?.lastReason})))).toEqual([follower.observation.id]);
 expect(inspectRollerMotion(s,w,r.motions[0].action)).toEqual([]);
 const done=advanceStream(s,r.world,r.motions,100+r.motions[0].action.seconds+.01);
 expect(done.world.cells[0].placements).toHaveLength(2);
 expect(done.world.stream!.dispatched).toHaveLength(0);
});
it('rejects an empty-tool route through an accumulated roller parcel',()=>{
 const {s,w,head,follower}=fixture();
 const o=observedProblem(s,w),d=planStream(o.scenario,o.world),a=applyDecision(s,w,[],d).motions[0].action;
 const safe=structuredClone(a);safe.boxId=follower.observation.id;
 // The source obstacle is transformed to pallet-local coordinates by the same
 // conversion used by execution, avoiding any dependence on world origin.
 const source=a.path!.points.find(v=>v.label==='롤러 정지 · 파지')!;
 const blocked=structuredClone(safe);blocked.boxId=head.observation.id;
 blocked.path={...safe.path!,points:[{...source,tcp:{...source.tcp,z:source.tcp.z-50},carrying:false},{...source,tcp:{...source.tcp,z:source.tcp.z+50},carrying:false}]};
 expect(inspectRollerMotion(s,w,blocked)).toContain('롤러 대기 박스와 운반 경로 간섭');
});
it('permits a taller-than-footprint limit without changing the cartons or safety settings',()=>{
 const s=streamInventory(42,8),next=applyStreamSettings(s,{...streamSettings(s),height:2200});
 expect(next.pallet.maxHeight).toBeGreaterThan(Math.max(next.pallet.width,next.pallet.depth));
 expect(next.types).toEqual(s.types);expect(next.constraints).toEqual(s.constraints);
});

it('exchanges a saturated lane even when only two large cartons fit fully on the roller',()=>{
 const {s,w,head,follower}=fixture(),third=w.boxes[3];
 w.stream!.inputClosed=false;w.boxes[4].status='pending';
 for(const [i,b] of [head,follower,third].entries()){
  b.observation.size={w:800,d:600,h:500};b.status='belt';
  const arc=stopArc(b,s.pallet)-i*1100;
  b.flow={enteredAt:0,measuredAt:0,passes:0,lastReason:'높이·경계 초과',checks:{0:{version:0,at:90,reason:'배치 불가',blocked:0,tested:0}},roller:{arc,limit:arc,at:100,attempts:2,waitingSince:0}};
 }
 expect(atRollerPickup(head,s.pallet)).toBe(true);expect(atRollerPickup(follower,s.pallet)).toBe(true);expect(atRollerPickup(third,s.pallet)).toBe(false);
 w.stream!.cells[0].rejected=[head.observation.id,follower.observation.id];
 expect(advanceStream(s,w,[],100).world.stream!.cells[0].phase).toBe('checking');
});

it('uses aspect ratio as a preference while preserving hard support, load and tipping limits',()=>{
 const s=streamInventory(42,8),n=tallStackProfile(s);
 expect(n.constraints.stability!.slendernessMode).toBe('score');
 expect(n.constraints.stability).toEqual({...s.constraints.stability,slendernessMode:'score'});
 expect(n.types).toEqual(s.types);expect(n.constraints.supportRatio).toBe(.92);
 expect(n.constraints.stability!.lateralAccelerationG).toBe(.15);
 expect(s.constraints.stability!.slendernessMode).toBe('hard');
 const custom={...s,id:'packaging-aware'};expect(tallStackProfile(custom)).toEqual(custom);
});

it('accepts a 1950 mm stack only when every contact and transmitted-load margin remains valid',()=>{
 const s=tallStackProfile(streamInventory(42,8,2200)),b={...createStream(s).boxes[0].observation,size:{w:600,d:600,h:150},weight:1,maxLoadKg:150,strengthFactor:1,handling:undefined,orientationAllowed:[0] as const};
 const c={...receiveConstraints(s),heavyRule:'off' as const};
 let stack:import('../src/pallet/types').Placement[]=[];
 for(let i=0;i<13;i++){
  const current={...b,id:`layer-${i}`,orientationAllowed:[0 as const]},p={id:current.id,typeId:current.typeId,position:{x:100,y:50,z:i*150},size:current.size,weight:1,maxLoadKg:150,strengthFactor:1,orientation:0 as const,supports:[],supportRatio:1,loadAbove:0};
  const r=inspectConstraints(p,current,stack,s.pallet,c);expect(r.reasons).toEqual([]);stack=r.stack;
 }
 expect(Math.max(...stack.map(p=>p.position.z+p.size.h))).toBe(1950);
 expect(s.pallet.width).toBeLessThan(1950);
 const last=stack.at(-1)!,unstable={...last,position:{...last.position,x:480}};
 expect(inspectConstraints(unstable,{...b,id:last.id,orientationAllowed:[0]},stack.slice(0,-1),s.pallet,c).reasons.some(r=>r.includes('SUPPORT')||r.includes('무게중심'))).toBe(true);
 const weak=stack.map((p,i)=>i===0?{...p,maxLoadKg:.5,maxLoadSource:'synthetic' as const}:p);
 expect(inspectConstraints(last,{...b,id:last.id,orientationAllowed:[0]},weak.slice(0,-1),s.pallet,c).reasons.some(r=>r.includes('하중 초과'))).toBe(true);
});
