import {it,expect} from 'vitest';
import {clusterScenario,clusterFleetDemo} from '../src/pallet/cluster/preset';
import {createStream,advanceStream,assertStreamInventory} from '../src/pallet/relay/streamEngine';
import {footprint} from '../src/pallet/relay/rollerQueue';

it('moves and feeds the fleet demo faster while preserving queue clearance and frozen input',()=>{
 const fast=clusterFleetDemo(),slow=structuredClone(fast);
 delete slow.clusterPreset!.demonstration;
 let a=createStream(fast),b=createStream(slow);
 expect(createStream(clusterScenario()).stream!.speed).toBe(210);
 for(let tick=1;tick<=120;tick++){
  const time=tick/10;
  a=advanceStream(fast,a,[],time).world;b=advanceStream(slow,b,[],time).world;
  if(tick===11)expect(a.boxes[0].flow!.transport!.arc/b.boxes[0].flow!.transport!.arc).toBeCloseTo(1.5);
  const lane=a.boxes.filter(q=>q.status==='belt').sort((x,y)=>x.flow!.transport!.arc-y.flow!.transport!.arc);
  for(let i=1;i<lane.length;i++)expect(lane[i].flow!.transport!.arc-lane[i-1].flow!.transport!.arc).toBeGreaterThanOrEqual((footprint(lane[i])+footprint(lane[i-1]))/2+100-1e-6);
  expect(assertStreamInventory(a,[])).toBe(true);
 }
 expect(a.stream!.entered).toBeGreaterThan(b.stream!.entered);
 expect(fast.constraints).toEqual(slow.constraints);
 console.log('fleet release at 12s', {before:b.stream!.entered,after:a.stream!.entered,speed:a.stream!.speed});
});
