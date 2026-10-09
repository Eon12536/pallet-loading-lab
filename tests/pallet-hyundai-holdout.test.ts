import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { singleStudyConfig, studyRowScore } from '../src/pallet/benchmark/singleStudy';
import { runTrial } from '../src/pallet/benchmark/runner';
import { distribution } from '../src/pallet/benchmark/statistics';
import { getAlgorithm } from '../src/pallet/benchmark/registry';
import { csv } from '../src/pallet/benchmark/export';
import type { TrialRow } from '../src/pallet/benchmark/model';

it('validates the preselected candidates on new arrival seeds with matched rotation controls', async () => {
 const repeats=20, seed=100, algorithms=['hrpal-inferred','greedy','future-hybrid'];
 const groups:Record<string,{config:ReturnType<typeof singleStudyConfig>;rows:TrialRow[]}>= {};
 const started=performance.now();
 let measured=0;
 for(const mode of ['native-allowed','shared-upright']) {
  const config=singleStudyConfig(repeats,seed);config.algorithms=algorithms;
  config.settings.conventionalPattern='column';
  if(mode==='shared-upright')for(const type of config.scenario.types)type.orientations=[0,90];
  const rows:TrialRow[]=[];groups[mode]={config,rows};
  for(const algorithm of algorithms)await runTrial(config,{algorithm,caseId:'identical',seed,episode:0});
  for(let episode=0;episode<repeats;episode++)for(const caseId of config.cases) {
   const offset=episode%algorithms.length, order=[...algorithms.slice(offset),...algorithms.slice(0,offset)];
   for(const algorithm of order) {
    const row=await runTrial(config,{algorithm,caseId,seed:seed+episode,episode});rows.push(row);measured++;
    const peers=rows.filter(r=>r.seed===row.seed&&r.caseId===caseId);
    expect(row.fingerprint).toBe(peers[0].fingerprint);expect(row.arrivalIds).toEqual(peers[0].arrivalIds);
    if(measured%12===0)console.log(`HOLDOUT ${measured}/240 ${mode} ${caseId} seed=${row.seed} ${algorithm}: ${row.values.count}`);
   }
  }
 }
 const keys=['count','completion','utilization','height','supportMin','meanMs','p95Ms','workSeconds','distanceM','unplaced','candidates'];
 const summaries=Object.fromEntries(Object.entries(groups).map(([mode,{config,rows}])=>[mode,{
  config,
  byCase:Object.fromEntries(config.cases.map(caseId=>[caseId,algorithms.map(algorithm=>{
   const trials=rows.filter(r=>r.algorithm===algorithm&&r.caseId===caseId);
   return {algorithm,name:getAlgorithm(algorithm).name,score:distribution(trials.map(studyRowScore)),
    metrics:Object.fromEntries(keys.map(key=>[key,distribution(trials.map(r=>r.values[key]))])),
    outcomes:trials.reduce<Record<string,number>>((o,r)=>(o[r.outcome]=(o[r.outcome]??0)+1,o),{}),
    rejectedProposals:trials.reduce((n,r)=>n+Object.values(r.proposalViolations).reduce<number>((a,b)=>a+(b??0),0),0),
    invalidFinals:trials.filter(r=>r.finalReasons?.length).length};
  })])),
  pairedDifferences:Object.fromEntries(config.cases.map(caseId=>[caseId,algorithms.slice(1).map(algorithm=>{
   const paired=Array.from({length:repeats},(_,episode)=>{
    const a=rows.find(r=>r.caseId===caseId&&r.algorithm===algorithm&&r.seed===seed+episode)!;
    const b=rows.find(r=>r.caseId===caseId&&r.algorithm===algorithms[0]&&r.seed===a.seed)!;
    return {count:a.values.count!-b.values.count!,utilization:a.values.utilization!-b.values.utilization!,score:studyRowScore(a)!-studyRowScore(b)!};
   });
   return {algorithm,count:distribution(paired.map(p=>p.count)),utilization:distribution(paired.map(p=>p.utilization)),score:distribution(paired.map(p=>p.score)),wins:paired.filter(p=>p.count>0).length,ties:paired.filter(p=>p.count===0).length,losses:paired.filter(p=>p.count<0).length};
  })])),rows
 }]));
 const reproducibility=[];
 for(const [mode,{config,rows}] of Object.entries(groups))for(const caseId of config.cases) {
  const original=rows.find(r=>r.algorithm==='greedy'&&r.caseId===caseId&&r.seed===seed)!;
  const again=await runTrial(config,{algorithm:'greedy',caseId,seed,episode:0});
  const expected=original.trace?.map(t=>({placement:t.placement,disposition:t.disposition}));
  expect(again.trace?.map(t=>({placement:t.placement,disposition:t.disposition}))).toEqual(expected);
  reproducibility.push({mode,caseId,seed,algorithm:'greedy',matched:true});
 }
 const allRows=Object.values(groups).flatMap(g=>g.rows);
 const invalid=allRows.filter(r=>r.finalReasons?.length||Object.values(r.proposalViolations).some(n=>(n??0)>0)||['error','timeout','constraint-rejected','environment-blocked'].includes(r.outcome));
 const report={schema:'ALPS-HRPal-candidate-holdout/1',createdAt:new Date().toISOString(),source:'Existing ALPS simulator and shared benchmark runner; no algorithm changes.',
  scope:'Synthetic one-arm one-pallet static geometry and TCP/gripper proxy. Conventional Column implementation is not actual HRPal. No real robot IK, vacuum or dynamic collapse verification.',
  hypothesis:'Greedy and Future-Aware Hybrid preselected using seeds 42–46. Holdout seeds 100–119; no tuning after observing holdout.',
  confidence:'Approximate Student-t 95% confidence intervals. Paired differences use identical input per seed. Applies only to this synthetic profile; no claim about actual Hyundai performance.',
  environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,workers:1},
  trials:allRows.length,warmupTrials:6,reproducibilityTrials:4,elapsedMs:performance.now()-started,invalid:invalid.map(r=>({id:r.id,outcome:r.outcome,reasons:r.finalReasons,violations:r.proposalViolations})),reproducibility,groups:summaries};
 mkdirSync('docs',{recursive:true});writeFileSync('docs/hrpal-candidate-holdout.json',JSON.stringify(report));
 for(const [mode,{rows}] of Object.entries(groups))writeFileSync(`docs/hrpal-candidate-${mode}.csv`,csv(rows));
 console.log(JSON.stringify({trials:report.trials,invalid:report.invalid,groups:Object.fromEntries(Object.entries(summaries).map(([mode,s])=>[mode,{byCase:s.byCase,pairedDifferences:s.pairedDifferences}]))}));
 expect(allRows).toHaveLength(240);expect(invalid).toEqual([]);
},1_200_000);
