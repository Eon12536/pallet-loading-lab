import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import * as before from './fixtures/pallet-fill-v36/streamEngine';
import {observedProblem as observeBefore,planStream as planBefore} from './fixtures/pallet-fill-v36/streamPlanner';
import * as after from '../src/pallet/relay/streamEngine';
import {observedProblem,planStream} from '../src/pallet/relay/streamPlanner';
import {streamInventory} from '../src/pallet/relay/streamInventory';
import {applyPractical} from '../src/pallet/relay/practical';
import {withFleet} from '../src/pallet/relay/fleet';
import {allPallets} from '../src/pallet/relay/palletStations';
import {top,intersects} from '../src/pallet/geometry';
import {inspectConstraints} from '../src/pallet/constraints';
import {receiveConstraints} from '../src/pallet/relay/motion';
import type {RelayMotion} from '../src/pallet/relay/types';

it('measures paired pallet density with identical cartons and unchanged physical constraints',()=>{
 const reports=[];
 for(const seed of [42,821,822])for(const variant of ['before','after'] as const){
  const s=applyPractical(withFleet(streamInventory(seed,120,2200),{count:1,architecture:'floor'}));
  s.pallet.conveyorMode='straight';s.pallet.palletsPerRobot=1;s.pallet.conveyorExtensionMm=1500;s.intake={damageRate:.16,thresholdMm:8};
  const engine=variant==='before'?before:after,observe=variant==='before'?observeBefore:observedProblem,plan=variant==='before'?planBefore:planStream;
  let w=engine.createStream(s),motions:RelayMotion[]=[],ms=0;w.runId=variant+'-'+seed;
  for(let time=1;time<=6000;time+=4){
   ({world:w,motions}=engine.advanceStream(s,w,motions,time));
   const o=observe(s,w),d=plan(o.scenario,o.world,motions.map(m=>m.action.robot));ms+=d.milliseconds;
   ({world:w,motions}=engine.applyDecision(s,w,motions,d));if(w.stream!.complete)break;
  }
  const pallets=[...w.stream!.dispatched,...allPallets(w).map(v=>v.cell)].filter(p=>p.placements.length);
  for(const pallet of pallets){let stack:typeof pallet.placements=[];for(const p of pallet.placements){
   const b=w.boxes.find(b=>b.observation.id===p.id)!.observation,r=inspectConstraints(p,b,stack,s.pallet,{...receiveConstraints(s),robotMode:'ideal'});
   expect(r.reasons,`${variant}/${seed}/${p.id}`).toEqual([]);stack=r.stack;
   expect(top(p)).toBeLessThanOrEqual(s.pallet.maxHeight);expect(stack.some(q=>q.id!==p.id&&intersects(p,q))).toBe(false);
  }}
  const row={variant,seed,complete:w.stream!.complete,input:120,placed:w.records.length,pallets:pallets.length,meanBoxes:pallets.reduce((n,p)=>n+p.placements.length,0)/Math.max(1,pallets.length),oneBoxPallets:pallets.filter(p=>p.placements.length===1).length,maxHeight:Math.max(0,...pallets.flatMap(p=>p.placements.map(top))),counts:pallets.map(p=>p.placements.length),heights:pallets.map(p=>Math.max(...p.placements.map(top))),outfeed:w.boxes.filter(b=>b.status==='outfeed').length,quarantined:w.boxes.filter(b=>b.status==='quarantined').length,unresolved:w.boxes.filter(b=>!['placed','outfeed','quarantined'].includes(b.status)).map(b=>({id:b.observation.id,status:b.status,reason:b.flow?.lastReason,roller:b.flow?.roller,checks:b.flow?.checks})),elapsed:w.time,planningMs:ms};
  reports.push(row);console.log(JSON.stringify(row));
 }
 mkdirSync('docs',{recursive:true});writeFileSync('docs/pallet-fill-results.json',JSON.stringify({measuredAt:new Date().toISOString(),conditions:{width:1800,depth:1500,height:2200,input:120,seeds:[42,821,822],maxSimSeconds:6000,stepSeconds:4,robot:'floor',intakeDamageRate:.16,scope:'static support/load + gripper/queue geometry; real hardware unverified'},reports},null,2));
 expect(reports.every(r=>r.complete)).toBe(true);
},180000);
