import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {simpleConfig,simpleReport,THREE_IDS} from '../src/pallet/benchmark/simpleStudy';
import {threeConfig,runThreeTrial} from '../src/pallet/benchmark/threeStudy';
import {initialDashboardView} from '../src/pallet/relay/dashboardView';
import type {TrialRow} from '../src/pallet/benchmark/model';
it('isolates the 2/3 dimensions and keeps existing profile unchanged',()=>{
 const c=simpleConfig();expect(c.scenario.pallet.width).toBe(1800*2/3);expect(c.scenario.pallet.depth).toBe(1500*2/3);
 expect(c.scenario.pallet.robotLayout?.count).toBe(1);expect(c.scenario.pallet.palletsPerRobot).toBe(1);
 expect(threeConfig().scenario.pallet.width).toBe(1000);expect(initialDashboardView('?palletView=simple')).toBe('simple');
 expect(()=>simpleConfig('wide',120,42,0)).toThrow();
});
it('measures common constraints and identical input over three seeds, retaining one pallet',async()=>{
 const config=simpleConfig(),rows:TrialRow[]=[];
 for(const algorithm of THREE_IDS){const warm=await runThreeTrial(config,{algorithm,caseId:'mixed',seed:42,episode:0});expect(warm.finalReasons,warm.reason).toEqual([]);}
 for(let episode=0;episode<3;episode++){
  for(const algorithm of [...THREE_IDS.slice(episode),...THREE_IDS.slice(0,episode)]){
   const row=await runThreeTrial(config,{algorithm,caseId:'mixed',seed:42+episode,episode});rows.push(row);
   expect(row.outcome,row.reason).not.toMatch(/error|timeout|constraint-rejected/);expect(row.finalReasons).toEqual([]);
   expect(row.values.shipments).toBe(0);expect(row.values.pallets).toBe(1);expect(row.values.count).toBeGreaterThan(1);
   expect(row.values.height).toBeLessThanOrEqual(2200);expect(row.trace!.filter(t=>t.placement).length).toBe(row.values.count);
   console.log(JSON.stringify({algorithm,seed:row.seed,count:row.values.count,height:row.values.height,p95:row.values.p95Ms}));
  }
  const group=rows.filter(r=>r.episode===episode);expect(new Set(group.map(r=>r.arrivalIds.join())).size).toBe(1);expect(new Set(group.map(r=>r.fingerprint)).size).toBe(1);
 }
 const replay=await runThreeTrial(config,{algorithm:'greedy',caseId:'mixed',seed:42,episode:0});
 expect(replay.trace!.map(t=>t.placement?.position)).toEqual(rows.find(r=>r.algorithm==='greedy'&&r.seed===42)!.trace!.map(t=>t.placement?.position));
 writeFileSync('public/simple-pallet-benchmark.json',JSON.stringify(simpleReport(rows,config)));
 writeFileSync('docs/simple-pallet-benchmark.json',JSON.stringify(simpleReport(rows,config),null,2));
},600000);
