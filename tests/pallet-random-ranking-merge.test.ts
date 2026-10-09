import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {rankingReport,rankingCsv,rankingTrialConfig} from '../src/pallet/benchmark/randomRanking';
import {fingerprint} from '../src/pallet/benchmark/statistics';
import type {BenchmarkConfig,TrialRow} from '../src/pallet/benchmark/model';
it.runIf(process.env.MERGE_RANDOM_RANKING==='1')('audits and combines 100 paired episodes without duplicate/missing seeds',()=>{
 const parts=Array.from({length:4},(_,i)=>JSON.parse(readFileSync(`docs/simple-random-ranking-part-${i}.json`,'utf8')));
 const config:BenchmarkConfig=parts[0].config,rows:TrialRow[]=parts.flatMap(p=>p.rows).sort((a,b)=>a.episode-b.episode||a.algorithm.localeCompare(b.algorithm));
 expect(rows.length).toBe(300);expect(new Set(rows.map(r=>r.id)).size).toBe(300);
 for(let episode=0;episode<100;episode++){
  const rr=rows.filter(r=>r.episode===episode),seed=(config.seed+episode)%2147483648,c=rankingTrialConfig(config,seed);
  expect(rr).toHaveLength(3);expect(new Set(rr.map(r=>r.algorithm)).size).toBe(3);expect(rr.every(r=>r.seed===seed)).toBe(true);
  expect(new Set(rr.map(r=>r.arrivalIds.join())).size).toBe(1);expect(new Set(rr.map(r=>r.fingerprint)).size).toBe(1);
  expect(rr[0].fingerprint).toBe(fingerprint({scenario:c.scenario,settings:c.settings,policy:'defer-full-pass/1'}));
  expect(rr.every(r=>r.finalReasons?.length===0&&r.values.shipments===0)).toBe(true);
 }
 const report=rankingReport(rows,config);expect(report.ranking.every(r=>r.eligible&&r.valid===100)).toBe(true);expect(report.paired.every(p=>p.difference.n===100)).toBe(true);
 const conditions=Array.from({length:100},(_,episode)=>{const seed=(config.seed+episode)%2147483648,c=rankingTrialConfig(config,seed);return {seed,types:c.scenario.types,arrival:c.scenario.arrival};});
 const data={...report,conditions,execution:{...parts[0].execution,parallelBatches:4,batches:parts.map(p=>({first:p.first,last:p.last,elapsedSeconds:p.execution.elapsedSeconds})),scoringScope:'기하·정적·TCP 근사 모델 순위. 실제 로봇 검증 완료 순위 아님.'}};
 writeFileSync('docs/simple-random-ranking.json',JSON.stringify(data,null,2));writeFileSync('public/simple-random-ranking.json',JSON.stringify(data));writeFileSync('docs/simple-random-ranking.csv',rankingCsv(rows,config));
 console.log(JSON.stringify(report.ranking.map((r,i)=>({rank:i+1,name:r.name,mean:r.score.mean,std:r.score.std,ci:r.score.ci95,count:r.metrics.count.mean,utilization:r.metrics.utilization.mean,p95:r.metrics.p95Ms.mean}))));console.log(JSON.stringify(report.paired));
});
