import { it,expect } from 'vitest';
import { mkdirSync,writeFileSync } from 'node:fs';
import { prepareSixArea } from '../src/pallet/benchmark/sixArea';
import { singleStudyConfig } from '../src/pallet/benchmark/singleStudy';
import { runTrial } from '../src/pallet/benchmark/runner';
import { aggregate } from '../src/pallet/benchmark/scoring';
import { csv } from '../src/pallet/benchmark/export';
import { DEFAULT_WEIGHTS,DEFAULT_THRESHOLDS } from '../src/pallet/benchmark/model';
import type { TrialRow } from '../src/pallet/benchmark/model';

it('measures every active online algorithm with mandatory random-order, exception and robot conditions',async()=>{
 const base=singleStudyConfig(Number(process.env.SIX_AREA_REPEATS||10),42);base.cases=['random','randomExceptions'];base.decisionMs=10000;
 const config=prepareSixArea(base),rows:TrialRow[]=[],started=performance.now(),warmups=new Map<string,TrialRow>();
 for(const algorithm of config.algorithms)warmups.set(algorithm,await runTrial(config,{algorithm,caseId:'random',seed:config.seed,episode:0}));
 for(let episode=0;episode<config.repeats;episode++)for(const caseId of config.cases){
  const offset=episode%config.algorithms.length,order=[...config.algorithms.slice(offset),...config.algorithms.slice(0,offset)];
  for(const algorithm of order){
   const row=await runTrial(config,{algorithm,caseId,seed:config.seed+episode,episode});row.warmup={requested:1,completed:1,outcomes:[warmups.get(algorithm)!.outcome],sameWorker:false};rows.push(row);
   const peer=rows.find(r=>r.caseId===caseId&&r.seed===row.seed)!;expect(row.fingerprint).toBe(peer.fingerprint);expect(row.arrivalIds).toEqual(peer.arrivalIds);
   expect(row.proposalViolations).toEqual({});expect(['error','timeout','constraint-rejected']).not.toContain(row.outcome);if(caseId==='randomExceptions')expect(row.exceptions).toHaveLength(3);
  }
  console.log(`MEASURE ${rows.length}/${config.algorithms.length*config.cases.length*config.repeats} · ${caseId} seed ${config.seed+episode}`);
 }
 const summary=aggregate(rows);expect(summary).toHaveLength(config.algorithms.length);for(const a of summary){expect(a.missing,a.algorithm).toEqual([]);expect(a.coverage,a.algorithm).toBe(100);}
 const report={schema:'PAC-SixArea/1',createdAt:new Date().toISOString(),config,weights:DEFAULT_WEIGHTS,thresholds:DEFAULT_THRESHOLDS,environment:{runtime:process.version,platform:process.platform,architecture:process.arch},elapsedMs:performance.now()-started,verification:'정적 제약·TCP/그리퍼 기하 근사. IK·진공 밀봉·동적 붕괴 미검증. 워밍업 제외. 미래 순서 비공개.',summary:summary.map(({rows,...a})=>a),rows};
 mkdirSync('docs',{recursive:true});mkdirSync('public',{recursive:true});writeFileSync('docs/benchmark-six-area.json',JSON.stringify(report,null,2));writeFileSync('public/benchmark-six-area.json',JSON.stringify(report));writeFileSync('docs/benchmark-six-area.csv',csv(rows));
 console.table(summary.map(a=>({algorithm:a.algorithm,score:a.score?.toFixed(2),coverage:a.coverage,placed:a.metrics.count.mean?.toFixed(2),exceptions:a.scores.exception,robot:a.scores.robot,failed:a.failed,rank:a.rank})));
},3600000);
