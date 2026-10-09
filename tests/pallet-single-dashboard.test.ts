import {it,expect} from 'vitest';
import {dashboardPalletsPerRobot} from '../src/pallet/relay/dashboardView';
import {streamInventory} from '../src/pallet/relay/streamInventory';
import {withFleet} from '../src/pallet/relay/fleet';
import {createStream} from '../src/pallet/relay/streamEngine';
import {allPallets} from '../src/pallet/relay/palletStations';

it('single demonstration has one working pallet while expansion keeps eight',()=>{
 for(const single of [true,false]){
  const n=single?1:4,s=withFleet(streamInventory(42),{count:n,architecture:'floor',floorCount:n});
  s.pallet.palletsPerRobot=dashboardPalletsPerRobot(single);
  const w=createStream(s);
  expect(allPallets(w)).toHaveLength(single?1:8);
  expect(w.secondaryCells===undefined).toBe(single);
 }
});
