import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {cpus,totalmem} from 'node:os';
import {randomRankingConfig,rankingTrialConfig,rankingSummary,rankingReport,trialScore} from '../src/pallet/benchmark/randomRanking';
import {THREE_IDS,runThreeTrial} from '../src/pallet/benchmark/threeStudy';
import type {TrialRow} from '../src/pallet/benchmark/model';
it('randomizes box specifications reproducibly, retains shared constraints and separates seeds',()=>{
 const a=randomRankingConfig(42),b=randomRankingConfig(42),c=randomRankingConfig(43);
 expect(a).toEqual(b);expect(c.scenario.types).not.toEqual(a.scenario.types);
 expect(a.scenario.types.reduce((n,t)=>n+t.quantity,0)).toBe(120);expect(a.scenario.pallet.width).toBe(1200);
 expect(rankingTrialConfig(a,43)).toEqual(c);expect(a.scenario.constraints).toEqual(c.scenario.constraints);
});
it('leaves empty and incomplete rankings unranked without inventing zero scores',()=>{
 const c=randomRankingConfig();const r=rankingSummary([],c);expect(r.ranking.every(x=>!x.eligible&&x.score.mean===null)).toBe(true);expect(r.paired).toEqual([]);
});
it('applies the existing six-axis weights and excludes failed runs from a confirmed ranking',()=>{
 const c=randomRankingConfig(42,2),r:TrialRow={id:'fixture',algorithm:'greedy',scope:'online',caseId:'mixed',seed:42,episode:0,fingerprint:'same',arrivalIds:[],outcome:'partial',reason:'',values:{count:30,completion:50,density:80,supportMin:100,imbalance:0,workSeconds:300,p95Ms:0},proposalViolations:{},candidateRejections:{},exceptions:[],strength:'explicit',robot:'proxy',pallet:c.scenario.pallet,constraints:c.scenario.constraints};
 expect(trialScore(r)).toBeCloseTo(20+16+15+10+100*(30/35)*.1+5);
 expect(trialScore({...r,values:{...r.values,completion:NaN}})).toBeNull();
 const bad={...r,seed:43,outcome:'constraint-rejected' as const,finalReasons:['충돌']};expect(trialScore(bad)).toBeNull();
 const s=rankingSummary([r,bad],c).ranking.find(x=>x.id==='greedy')!;expect(s.eligible).toBe(false);expect(s.valid).toBe(1);expect(s.invalid).toBe(1);expect(s.score.mean).toBe(trialScore(r));
});
it.runIf(process.env.RUN_RANDOM_RANKING==='1')('measures 100 paired random box sets and exports the ranking',async()=>{
 const config=randomRankingConfig(),rows:TrialRow[]=[];const start=performance.now();
 const first=Number(process.env.RANK_FIRST??0),last=Number(process.env.RANK_LAST??config.repeats),batch=process.env.RANK_BATCH;
 for(const algorithm of THREE_IDS)await runThreeTrial(config,{algorithm,caseId:'mixed',seed:42,episode:0});
 for(let episode=first;episode<last;episode++){
  const seed=config.seed+episode,c=rankingTrialConfig(config,seed);
  for(const algorithm of [...THREE_IDS.slice(episode%3),...THREE_IDS.slice(0,episode%3)]){
   const r=await runThreeTrial(c,{algorithm,caseId:'mixed',seed,episode});r.trace=undefined;rows.push(r);
   expect(r.values.shipments).toBe(0);expect(r.finalReasons,r.reason).toEqual([]);expect(trialScore(r),r.reason).not.toBeNull();
  }
  const group=rows.filter(r=>r.episode===episode);expect(new Set(group.map(r=>r.fingerprint)).size).toBe(1);expect(new Set(group.map(r=>r.arrivalIds.join())).size).toBe(1);
  writeFileSync(`docs/simple-random-ranking-progress${batch?'-'+batch:''}.json`,JSON.stringify({completed:episode-first+1,total:last-first,first,last,elapsedSeconds:(performance.now()-start)/1000}));
  if((episode+1)%5===0)console.log(JSON.stringify({completed:episode+1,seconds:Math.round((performance.now()-start)/1000)}));
 }
 if(batch){writeFileSync(`docs/simple-random-ranking-part-${batch}.json`,JSON.stringify({rows,first,last,config,execution:{node:process.version,platform:process.platform,cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryGB:totalmem()/1024**3,elapsedSeconds:(performance.now()-start)/1000,warmup:'각 알고리즘 1회 미채점, 회차별 실행 순서 교대',isolation:'4개 독립 회차 배치를 동시에 실행. 배치 안에서는 알고리즘을 순차 실행. 백그라운드 부하/동시 실행이 시간 지표에 영향을 줄 수 있음.'}}));return;}
 const report=rankingReport(rows,config);expect(report.ranking.every(r=>r.eligible&&r.valid===100)).toBe(true);expect(report.paired.every(p=>p.difference.n===100)).toBe(true);
 const data={...report,execution:{node:process.version,platform:process.platform,cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryGB:totalmem()/1024**3,elapsedSeconds:(performance.now()-start)/1000,warmup:'각 알고리즘 1회 미채점, 회차별 실행 순서 교대',isolation:'동일 Node 프로세스에서 순차 측정. 전용/무부하 장비로 격리하지 않았으며 백그라운드 부하가 시간 측정에 영향을 줄 수 있음.'}};
 writeFileSync('docs/simple-random-ranking.json',JSON.stringify(data,null,2));writeFileSync('public/simple-random-ranking.json',JSON.stringify(data));
 const csv=['rank,algorithm,n,mean_score,sample_sd,ci95_low,ci95_high,mean_count,mean_utilization_pct,mean_height_mm,mean_p95_ms',...report.ranking.map((r,i)=>[i+1,r.name,r.valid,r.score.mean,r.score.std,...(r.score.ci95??[null,null]),r.metrics.count.mean,r.metrics.utilization.mean,r.metrics.height.mean,r.metrics.p95Ms.mean].join(','))].join('\n');writeFileSync('docs/simple-random-ranking.csv','\ufeff'+csv);
 console.log(JSON.stringify(report.ranking.map(r=>({name:r.name,n:r.valid,mean:r.score.mean,std:r.score.std,ci:r.score.ci95,count:r.metrics.count.mean}))));
},3600000);
