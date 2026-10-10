import {it,expect} from 'vitest';
import {clusterFleetDemo,clusterScenario} from '../src/pallet/cluster/preset';
import {createStream,advanceStream,applyDecision,assertStreamInventory} from '../src/pallet/relay/streamEngine';
import {streamPosition} from '../src/pallet/relay/streamGeometry';
import {hubRoute,HUB} from '../src/pallet/relay/hubConveyor';
import {planStream,observedProblem} from '../src/pallet/relay/streamPlanner';
import type {RelayMotion} from '../src/pallet/relay/types';
import {pusherBoxPosition} from '../src/pallet/relay/branchedConveyor';
import {rejectStation} from '../src/pallet/relay/rejectPallet';

it('routes four independently fed lanes with conservative shared-hub clearance',()=>{
 const s=clusterFleetDemo();let w=createStream(s),peakLanes=0;
 expect(clusterScenario().pallet.conveyorDistribution).toBeUndefined();
 expect(hubRoute(s.pallet,0)[0]).toEqual({x:0,y:HUB.y,z:450});
 for(let tick=1;tick<=1500;tick++){
  w=advanceStream(s,w,[],tick/10).world;
  for(const b of w.boxes.filter(b=>b.status==='belt'&&b.scan?.verdict==='normal'&&b.flow!.transport!.robot===undefined)){
   const counts=w.cells.map((_,i)=>w.boxes.filter(q=>q.status==='belt'&&q.flow?.transport?.robot===i).length),robot=counts.indexOf(Math.min(...counts));
   if(counts[robot]<2){b.flow!.transport!.robot=robot;b.owner=robot;}
  }
  const active=w.boxes.filter(b=>b.status==='belt'),pts=active.map(b=>streamPosition(b,w.time,w.stream!.speed,s.pallet));
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++)expect(Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y)).toBeGreaterThanOrEqual((Math.hypot(active[i].observation.size.w,active[i].observation.size.d)+Math.hypot(active[j].observation.size.w,active[j].observation.size.d))/2+100-1e-4);
  peakLanes=Math.max(peakLanes,new Set(active.filter(b=>b.flow!.transport!.kind==='branch').map(b=>b.owner)).size);expect(assertStreamInventory(w,[])).toBe(true);
 }
 expect(peakLanes).toBe(4);expect(w.stream!.entered).toBeGreaterThan(8);
},20000);
it('uses the real cluster planner to run all four robots without early pallet dispatch',()=>{
 const s=clusterFleetDemo(0,4,5);let w=createStream(s),motions:RelayMotion[]=[],peak=0;
 for(let tick=1;tick<=1200&&!w.stream!.complete;tick++){
  ({world:w,motions}=advanceStream(s,w,motions,tick/2));
  if(tick%4)continue;
  const o=observedProblem(s,w),d=planStream(o.scenario,o.world,motions.map(m=>m.action.robot));
  ({world:w,motions}=applyDecision(s,w,motions,d));peak=Math.max(peak,motions.length);expect(assertStreamInventory(w,motions)).toBe(true);
 }
 console.log('hub actual cluster', {peak,entered:w.stream!.entered,placed:w.cells.map(c=>c.placements.length),complete:w.stream!.complete});
 expect(w.cells.every(c=>c.placements.length>0)).toBe(true);expect(peak).toBe(4);expect(w.stream!.dispatched).toHaveLength(0);expect(w.stream!.complete).toBe(true);
},180000);
it('rejects scanned defects sideways before the central hub',()=>{
 const s=clusterFleetDemo(0,4,5);s.types.forEach(t=>t.quantity=1);s.intake!.damageRate=1;let w=createStream(s),seen=false;
 for(let tick=1;tick<=1000&&!w.stream!.complete;tick++){
  w=advanceStream(s,w,[],tick/4).world;
  for(const b of w.boxes){expect(b.flow?.transport?.kind).not.toBe('branch');if(b.status==='rejecting'){seen=true;expect(b.scan?.verdict).toBe('damaged');expect(b.flow!.reject!.from).toEqual({x:0,y:HUB.inletY+1500,z:450});}}
  expect(assertStreamInventory(w,[])).toBe(true);
 }
 expect(seen).toBe(true);expect(w.boxes.every(b=>b.status==='quarantined')).toBe(true);
 const from={x:0,y:HUB.inletY+1500,z:600},target=rejectStation(s.pallet);
 expect(pusherBoxPosition(from,target,1,s.pallet).x).toBeLessThan(0);expect(pusherBoxPosition(from,target,9,s.pallet)).toEqual(target);
});
