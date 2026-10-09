import {describe,it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {clusterScenario,CLUSTER_SETTINGS} from '../src/pallet/cluster/preset';
import {clusterInput} from '../src/pallet/cluster/dispatch';
import {contact} from '../src/pallet/cluster/contact';
import {clusterRank} from '../src/pallet/cluster/packing';
import {createStream,advanceStream,applyDecision,assertStreamInventory} from '../src/pallet/relay/streamEngine';
import {planStream,observedProblem} from '../src/pallet/relay/streamPlanner';
import {scanBox} from '../src/pallet/relay/intake';
import {ArrivalEnvironment} from '../src/pallet/environment';
import {top,intersects} from '../src/pallet/geometry';
import type {RelayMotion} from '../src/pallet/relay/types';
import type {Placement} from '../src/pallet/types';

describe('ALPS cluster fixed fleet',()=>{
 it('fixes exactly 30 cartons, strength, geometry and seed; clones without shared mutable state',()=>{
  const a=clusterScenario(6,0,4),b=clusterScenario(8,99,8);expect(a.types.map(t=>t.quantity)).toEqual([5,5,5,5,5,5]);expect(b.types.map(t=>t.quantity)).toEqual([4,4,4,4,4,4,3,3]);expect(b.arrival.seed).toBe(460100099);expect(a.pallet.maxHeight).toBe(1200);expect(a.constraints.stability!.loadSafetyFactor).toBe(1.2);expect(a.constraints.heavyRule).toBe('off');expect(CLUSTER_SETTINGS.temporaryBuffer).toBe(false);
  a.types[0].quantity=0;expect(clusterScenario().types[0].quantity).toBe(5);expect(()=>clusterScenario(6,100,4)).toThrow();
  const seq=(s:typeof b)=>{const e=new ArrivalEnvironment(s);return Array.from({length:e.total},(_,i)=>e.current(i)!.typeId);};expect(seq(b)).toEqual(seq(clusterScenario(8,99,1)));expect(seq(b)).not.toEqual(seq(clusterScenario(8,98,8)));
 });
 it('only projects observed parcels but keeps known SKU inventory and never sends future order to a placement request',()=>{
  const s=clusterScenario(),w=createStream(s),b=w.boxes[0];b.status='belt';b.flow={enteredAt:0,measuredAt:0,passes:0,lastReason:'',checks:{}};b.scan=scanBox(b,0,s);
  const p=observedProblem(s,w);expect(p.world.boxes).toHaveLength(1);expect(p.scenario.types).toHaveLength(6);const input=clusterInput(p.scenario,p.world,0,p.world.boxes[0]);expect(Object.keys(input)).not.toContain('arrival');expect(Object.keys(input)).not.toContain('queue');expect(Object.values(input.remaining).reduce((a,b)=>a+b,0)).toBe(29);
 });
 it('keeps all 17 lexicographic items and only counts physical shared faces',()=>{
  const s=clusterScenario(),w=createStream(s),b=w.boxes[0];b.flow={enteredAt:0,measuredAt:0,passes:0,lastReason:'',checks:{}};const input=clusterInput(s,w,0,b);
  const p:Placement={id:'a',typeId:'S1',position:{x:0,y:0,z:0},size:{w:400,d:300,h:280},weight:12,orientation:0,supports:[],supportRatio:1,loadAbove:0};
  input.placements=[p];const q={...p,id:'b',position:{x:400,y:0,z:0}};expect(contact(p,q).area).toBe(300*280);expect(contact(p,{...q,position:{...q.position,x:400.01}}).area).toBe(0);expect(clusterRank(q,input,'cluster-layer')).toHaveLength(17);
 });
 for(const [skus,robots] of [[6,1],[6,4],[8,4]] as const)it(`runs ${skus}SKU with ${robots} robots without duplicate commands, overlap or pallet replacement`,()=>{
  const s=clusterScenario(skus,0,robots);let w=createStream(s),motions:RelayMotion[]=[],peak=0,decisions=0;const started=performance.now();
  for(let time=.5;time<=1600&&!w.stream!.complete;time+=.5){
   ({world:w,motions}=advanceStream(s,w,motions,time));
   const observed=observedProblem(s,w),d=planStream(observed.scenario,observed.world,motions.map(m=>m.action.robot));
   expect(new Set(d.commands?.map(p=>p.boxId)).size).toBe(d.commands?.length??0);
   if(d.commands?.length||d.cluster?.rejectIds.length)decisions++;
   ({world:w,motions}=applyDecision(s,w,motions,d));peak=Math.max(peak,motions.length);expect(assertStreamInventory(w,motions)).toBe(true);
  }
  expect(w.stream!.complete).toBe(true);expect(w.boxes).toHaveLength(30);expect(w.records.length).toBeGreaterThan(0);expect(w.secondaryCells).toBeUndefined();expect(w.stream!.dispatched).toHaveLength(0);
  for(const c of w.cells){for(const p of c.placements){expect(top(p)).toBeLessThanOrEqual(1200);expect(p.supportRatio).toBeGreaterThanOrEqual(.85-1e-6);expect(p.loadAbove).toBeLessThanOrEqual(p.maxLoadKg!/1.2+1e-6);}for(let i=0;i<c.placements.length;i++)for(let j=i+1;j<c.placements.length;j++)expect(intersects(c.placements[i],c.placements[j])).toBe(false);}
  console.log('fleet placements',skus,robots,w.cells.map(c=>c.placements.length),peak);if(robots>1)expect(peak).toBeGreaterThan(1);
  const result={skus,robots,seed:s.arrival.seed,placed:w.boxes.filter(b=>b.status==='placed').length,outfeed:w.boxes.filter(b=>b.status==='outfeed').length,peak,decisions,simulationSeconds:w.time,computeMs:performance.now()-started,counts:w.cells.map(c=>c.placements.length),world:w};
  writeFileSync(`docs/cluster-fleet-${skus}-${robots}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,world:undefined}));
 },240000);
});
