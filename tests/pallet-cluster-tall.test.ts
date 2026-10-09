import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {clusterScenario,clusterFleetDemo} from '../src/pallet/cluster/preset';
import {createStream,advanceStream,applyDecision,assertStreamInventory} from '../src/pallet/relay/streamEngine';
import {planStream,observedProblem} from '../src/pallet/relay/streamPlanner';
import {intersects,top} from '../src/pallet/geometry';
import type {RelayMotion} from '../src/pallet/relay/types';
it('extends supply only; preserves the 30-box reproduction and fixed safety constraints',()=>{
 const base=clusterScenario(),demo=clusterFleetDemo();
 expect(base.types.reduce((n,t)=>n+t.quantity,0)).toBe(30);
 expect(demo.types.reduce((n,t)=>n+t.quantity,0)).toBe(240);
 expect(demo.types.map(t=>({...t,quantity:5}))).toEqual(base.types);
 expect(demo.constraints).toEqual(base.constraints);expect(demo.pallet).toEqual(base.pallet);
 expect(()=>clusterFleetDemo(0,4,81)).toThrow();
});
it('runs four robots with 6 SKU and enough supply for tall stacks, without automatic removal',()=>{
 const s=clusterFleetDemo();let w=createStream(s),motions:RelayMotion[]=[],peak=0,decisions=0;
 const start=performance.now();let lastProgress=0;
 for(let time=.5;time<=4000&&!w.stream!.complete;time+=.5){
  ({world:w,motions}=advanceStream(s,w,motions,time));
  if(w.stream!.entered>=lastProgress+40){lastProgress=w.stream!.entered;console.log('fleet-tall progress',lastProgress,w.records.length,w.time);}
  if(Math.round(time*2)%4!==0)continue;
  const observed=observedProblem(s,w),d=planStream(observed.scenario,observed.world,motions.map(m=>m.action.robot));
  expect(new Set(d.commands?.map(p=>p.boxId)).size).toBe(d.commands?.length??0);
  if(d.commands?.length||d.cluster?.rejectIds.length)decisions++;
  ({world:w,motions}=applyDecision(s,w,motions,d));peak=Math.max(peak,motions.length);
  expect(assertStreamInventory(w,motions)).toBe(true);
 }
 expect(w.stream!.complete).toBe(true);expect(w.stream!.dispatched).toHaveLength(0);expect(peak).toBeGreaterThan(1);
 const heights=w.cells.map(c=>Math.max(0,...c.placements.map(top)));
 for(const c of w.cells){for(const p of c.placements){expect(top(p)).toBeLessThanOrEqual(1200);expect(p.position.x).toBeGreaterThanOrEqual(0);expect(p.position.y).toBeGreaterThanOrEqual(0);expect(p.position.x+p.size.w).toBeLessThanOrEqual(1200);expect(p.position.y+p.size.d).toBeLessThanOrEqual(1000);expect([0,90]).toContain(p.orientation);expect(p.supportRatio).toBeGreaterThanOrEqual(.85-1e-6);expect(p.loadAbove).toBeLessThanOrEqual(p.maxLoadKg!/1.2+1e-6);}for(let i=0;i<c.placements.length;i++)for(let j=i+1;j<c.placements.length;j++)expect(intersects(c.placements[i],c.placements[j])).toBe(false);}
 const result={mode:'supply-extension-demonstration',skus:6,robots:4,seed:s.arrival.seed,supplied:w.boxes.length,placed:w.boxes.filter(b=>b.status==='placed').length,outfeed:w.boxes.filter(b=>b.status==='outfeed').length,heights,counts:w.cells.map(c=>c.placements.length),peak,decisions,simulationSeconds:w.time,computeMs:performance.now()-start,world:w};
 writeFileSync('docs/cluster-fleet-tall-6-4.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,world:undefined}));
},300000);
