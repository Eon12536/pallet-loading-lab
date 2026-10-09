import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {streamInventory} from '../src/pallet/relay/streamInventory';
import {withFleet} from '../src/pallet/relay/fleet';
import {applyPractical} from '../src/pallet/relay/practical';
import {tallStackProfile} from '../src/pallet/relay/streamSettings';
import {createStream,advanceStream,applyDecision,DEPARTURE_HEIGHT_RATIO} from '../src/pallet/relay/streamEngine';
import {observedProblem,planStream} from '../src/pallet/relay/streamPlanner';
import {allPallets} from '../src/pallet/relay/palletStations';
import {inspectConstraints} from '../src/pallet/constraints';
import {receiveConstraints} from '../src/pallet/relay/motion';
import {top} from '../src/pallet/geometry';
import type {RelayMotion} from '../src/pallet/relay/types';

it('fills the default single-cell stock without ever shipping a low pallet',()=>{
 const s=applyPractical(tallStackProfile(withFleet(streamInventory(42,240,2200),{count:1,architecture:'floor'})));
 s.pallet.conveyorMode='straight';s.pallet.palletsPerRobot=1;s.pallet.conveyorExtensionMm=1500;s.intake={damageRate:.16,thresholdMm:8};
 let w=createStream(s),motions:RelayMotion[]=[];const start=performance.now();
 for(let time=1;time<=12000;time+=4){
  ({world:w,motions}=advanceStream(s,w,motions,time));
  for(const p of allPallets(w))if(p.state!.phase==='checking'||p.state!.phase==='outbound')expect(Math.max(...p.cell.placements.map(top))).toBeGreaterThanOrEqual(2200*DEPARTURE_HEIGHT_RATIO);
  const o=observedProblem(s,w),d=planStream(o.scenario,o.world,motions.map(m=>m.action.robot));
  ({world:w,motions}=applyDecision(s,w,motions,d));if(w.stream!.complete)break;
 }
 const loads=[...w.stream!.dispatched,...allPallets(w).map(p=>p.cell)].filter(p=>p.placements.length);
 for(const load of loads){let stack:typeof load.placements=[];for(const p of load.placements){const b=w.boxes.find(b=>b.observation.id===p.id)!.observation,r=inspectConstraints(p,b,stack,s.pallet,{...receiveConstraints(s),robotMode:'ideal'});expect(r.reasons).toEqual([]);stack=r.stack;}}
 const report={seed:42,input:240,heightLimitMm:2200,automaticDepartureMinimumMm:2200*DEPARTURE_HEIGHT_RATIO,complete:w.stream!.complete,placed:w.records.length,dispatched:w.stream!.dispatched.map(p=>({count:p.placements.length,heightMm:Math.max(...p.placements.map(top))})),retained:allPallets(w).map(p=>({count:p.cell.placements.length,heightMm:Math.max(0,...p.cell.placements.map(top))})),manualWaiting:w.boxes.filter(b=>b.status==='outfeed').length,quarantined:w.boxes.filter(b=>b.status==='quarantined').length,elapsedSimSeconds:w.time,elapsedComputeMs:performance.now()-start,scope:'Existing static/contact/load and gripper geometry checks; actual hardware unverified'};
 writeFileSync('docs/pallet-retained-load.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 expect(w.stream!.complete).toBe(true);
 expect(w.stream!.dispatched.every(p=>Math.max(...p.placements.map(top))>=2200*DEPARTURE_HEIGHT_RATIO)).toBe(true);
 expect(w.records.length).toBeGreaterThan(1);
},180000);
