import { it,expect } from 'vitest';
import { writeFileSync,mkdirSync } from 'node:fs';
import { runTrial } from '../src/pallet/benchmark/runner';
import { singleStudyConfig,studyReport,studyRowScore,studyRanking } from '../src/pallet/benchmark/singleStudy';
import { csv } from '../src/pallet/benchmark/export';
import { initialDashboardView } from '../src/pallet/relay/dashboardView';
import type { TrialRow } from '../src/pallet/benchmark/model';
it('keeps the one-arm one-pallet configuration and explicit research route',()=>{
 const c=singleStudyConfig();expect(c.scenario.pallet.palletsPerRobot).toBe(1);expect(c.scenario.pallet.robotLayout?.count).toBe(1);expect(c.scenario.supplyMode).toBe('arrival');expect(c.settings.temporaryBuffer).not.toBe(true);expect(initialDashboardView('?palletView=single-study')).toBe('single-study');expect(c.algorithms).toContain('hrpal-inferred');expect(c.algorithms).not.toContain('offline-stock');
});
it('pattern replay is deterministic, commits shared checks, and ignores runtime in scoring',async()=>{
 const c=singleStudyConfig(1),spec={algorithm:'hrpal-inferred',caseId:'identical' as const,seed:42,episode:0};
 const a=await runTrial(c,spec),b=await runTrial(c,spec);expect(a.values.count).toBe(12);expect(a.outcome).toBe('complete');expect(a.proposalViolations).toEqual({});expect(a.trace?.map(t=>t.placement)).toEqual(b.trace?.map(t=>t.placement));
 expect(studyRowScore({...a,values:{...a.values,p95Ms:999999,totalMs:999999}})).toBe(studyRowScore(a));expect(studyRowScore({...a,outcome:'timeout'})).toBeNull();
 const only={...c,algorithms:['hrpal-inferred']};expect(studyRanking([a],only)[0].score).toBeNull();
});
it('measures every registered online algorithm on identical input and records full rankings',async()=>{
 const repeats=Number(process.env.SINGLE_STUDY_REPEATS||5),c=singleStudyConfig(repeats),rows:TrialRow[]=[];
 for(let episode=0;episode<c.repeats;episode++)for(const caseId of c.cases){
  const offset=episode%c.algorithms.length,order=[...c.algorithms.slice(offset),...c.algorithms.slice(0,offset)];
  for(const algorithm of order){
   const spec={algorithm,caseId,seed:c.seed+episode,episode};
   let warmup;
   if(episode===0&&caseId===c.cases[0])warmup=await runTrial(c,spec);
   const row=await runTrial(c,spec);row.warmup={requested:1,completed:1,outcomes:warmup?[warmup.outcome]:[],sameWorker:false};rows.push(row);
   const peers=rows.filter(r=>r.caseId===caseId&&r.seed===spec.seed);expect(row.arrivalIds).toEqual(peers[0].arrivalIds);expect(row.fingerprint).toBe(peers[0].fingerprint);expect(row.pallet.palletsPerRobot).toBe(1);
   expect(row.trace?.filter(t=>t.placement).every(t=>t.placement!.position.x>=0&&t.placement!.position.y>=0&&t.placement!.position.z+t.placement!.size.h<=row.pallet.maxHeight)).toBe(true);
   console.log(`MEASURE ${rows.length}/${c.algorithms.length*c.cases.length*c.repeats}: ${algorithm} ${caseId} seed=${spec.seed} placed=${row.values.count} score=${studyRowScore(row)?.toFixed(2)} ${row.outcome}`);
  }
 }
 expect(rows).toHaveLength(c.algorithms.length*c.cases.length*c.repeats);
 const report=studyReport(rows,c);expect(report.summary).toHaveLength(c.algorithms.length);
 mkdirSync('docs',{recursive:true});mkdirSync('public',{recursive:true});writeFileSync('docs/single-pallet-benchmark.json',JSON.stringify(report,null,2));writeFileSync('public/single-pallet-benchmark.json',JSON.stringify(report));writeFileSync('docs/single-pallet-benchmark.csv',csv(rows));
 console.table(report.summary.map(r=>({rank:r.rank,algorithm:r.algorithm,score:r.score?.toFixed(3),completion:r.completion.mean?.toFixed(1),placed:r.placed.mean,p95:r.p95Ms.mean?.toFixed(1),failures:r.failures})));
},3600000);
