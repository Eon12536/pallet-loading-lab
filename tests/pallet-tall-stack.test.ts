import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {streamInventory} from '../src/pallet/relay/streamInventory';
import {tallStackProfile} from '../src/pallet/relay/streamSettings';
import {applyPractical} from '../src/pallet/relay/practical';
import {withFleet} from '../src/pallet/relay/fleet';
import {createStream,advanceStream,applyDecision} from '../src/pallet/relay/streamEngine';
import {observedProblem,planStream} from '../src/pallet/relay/streamPlanner';
import {allPallets} from '../src/pallet/relay/palletStations';
import {top} from '../src/pallet/geometry';
import {inspectConstraints} from '../src/pallet/constraints';
import {receiveConstraints} from '../src/pallet/relay/motion';
import type {RelayMotion} from '../src/pallet/relay/types';
it('measures the taller profile without disabling transmitted-CG, support or load checks',()=>{
 const s=applyPractical(tallStackProfile(withFleet(streamInventory(42,240,2200),{count:1,architecture:'floor'})));
 s.pallet.conveyorMode='straight';s.pallet.palletsPerRobot=1;s.pallet.conveyorExtensionMm=1500;s.intake={damageRate:.16,thresholdMm:8};
 let w=createStream(s),motions:RelayMotion[]=[];
 for(let time=1;time<=9000;time+=4){
  ({world:w,motions}=advanceStream(s,w,motions,time));const o=observedProblem(s,w),d=planStream(o.scenario,o.world,motions.map(m=>m.action.robot));
  ({world:w,motions}=applyDecision(s,w,motions,d));if(w.stream!.complete)break;
 }
 const pallets=[...w.stream!.dispatched,...allPallets(w).map(v=>v.cell)].filter(p=>p.placements.length);
 for(const pallet of pallets){let stack:typeof pallet.placements=[];for(const p of pallet.placements){const b=w.boxes.find(b=>b.observation.id===p.id)!.observation,r=inspectConstraints(p,b,stack,s.pallet,{...receiveConstraints(s),robotMode:'ideal'});expect(r.reasons,p.id).toEqual([]);stack=r.stack;}}
 const result={seed:42,input:240,heightLimit:2200,slenderness:'preference',accelerationG:.15,supportRatio:.92,loadSafetyFactor:1.5,complete:w.stream!.complete,placed:w.records.length,counts:pallets.map(p=>p.placements.length),heights:pallets.map(p=>Math.max(...p.placements.map(top))),elapsed:w.time,unresolved:w.boxes.filter(b=>!['placed','outfeed','quarantined'].includes(b.status)).map(b=>({id:b.observation.id,status:b.status,reason:b.flow?.lastReason}))};
 writeFileSync('docs/pallet-tall-stack-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));expect(w.stream!.complete).toBe(true);
},180000);
