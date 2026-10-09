import { strategyDemo } from '../strategies/demo';
import { DEFAULT_STRATEGY } from '../strategies/PackingStrategy';
import { ONLINE_SEARCH } from '../types';
import { algorithmRegistry,getAlgorithm } from './registry';
import { distribution,clamp } from './statistics';
import type { BenchmarkConfig,CaseId,TrialRow } from './model';
import { HRPAL_SOURCE,HRPAL_ASSUMPTION } from './hrpal';

export const STUDY_SCHEMA='ALPS-single-pallet/2';
export const STUDY_FORMULA='50% 수량 완료율 + 25% 입력 부피 적재율 + 15% 최소 지지율 + 10% 경로 추정 작업효율. 작업효율 = 100×clamp((40−초/박스)/35). 계산시간은 별도 실측하며 순위 점수에 포함하지 않음.';
export function singleStudyConfig(repeats=5,seed=42):BenchmarkConfig {
 const scenario=strategyDemo();scenario.pallet.palletsPerRobot=1;scenario.pallet.robotLayout={count:1,architecture:'floor',floorCount:1};
 scenario.constraints.robotMode='gripper';scenario.constraints.gripper.payload=35;
 return {scenario,settings:{...structuredClone(ONLINE_SEARCH),maxCandidates:48,strategy:{...structuredClone(DEFAULT_STRATEGY),futureCandidates:8,lookaheadDepth:2,lookaheadSamples:3,lookaheadCandidates:4}},algorithms:algorithmRegistry().filter(a=>a.scope==='online').map(a=>a.id),cases:['identical','random'],repeats,seed,decisionMs:60000,trialMs:300000,probeLimit:0,includeOffline:false,warmupRuns:1};
}
export function studyRowScore(row:TrialRow){
 if(['error','timeout','constraint-rejected','environment-blocked'].includes(row.outcome)||Object.values(row.proposalViolations).some(n=>(n??0)>0))return null;
 const v=row.values,count=v.count??0,completion=v.completion??0;
 if(!count)return 0;
 const totalVolume=(v.utilization??0)/100*row.pallet.width*row.pallet.depth*row.pallet.maxHeight+(v.unplacedVolume??0)*1e9;
 const packedVolume=(v.utilization??0)/100*row.pallet.width*row.pallet.depth*row.pallet.maxHeight;
 const volume=totalVolume?100*packedVolume/totalVolume:0;
 if(v.workSeconds==null||v.supportMin==null)return null;
 return .50*completion+.25*volume+.15*v.supportMin+.10*100*clamp((40-v.workSeconds/count)/35);
}
export function studyRanking(rows:TrialRow[],config:BenchmarkConfig,caseId?:CaseId){
 const out=config.algorithms.map(algorithm=>{
  const rr=rows.filter(r=>r.algorithm===algorithm&&(!caseId||r.caseId===caseId));
  const scores=rr.map(studyRowScore),expected=config.repeats*(caseId?1:config.cases.length),complete=rr.length===expected;
  const score=complete&&scores.every(s=>s!==null)?scores.reduce<number>((n,s)=>n+s!,0)/expected:null;
  const stat=(key:string)=>distribution(rr.map(r=>r.values[key]??null));
  // Pair conditions within each seed; do not treat two correlated profiles as independent samples.
  const seedScores=[...new Set(rr.map(r=>r.seed))].map(seed=>{const group=rr.filter(r=>r.seed===seed).map(studyRowScore);return group.every(s=>s!==null)?group.reduce<number>((n,s)=>n+s!,0)/group.length:null;});
  return {algorithm,name:getAlgorithm(algorithm).name,rank:null as number|null,score,scoreDistribution:distribution(seedScores),trials:rr.length,expected,completion:stat('completion'),utilization:stat('utilization'),placed:stat('count'),support:stat('supportMin'),comZ:stat('comZ'),workSeconds:stat('workSeconds'),p95Ms:stat('p95Ms'),full:rr.filter(r=>r.outcome==='complete').length,failures:rr.filter(r=>studyRowScore(r)===null).length};
 }).sort((a,b)=>(b.score??-1)-(a.score??-1)||a.algorithm.localeCompare(b.algorithm));
 out.forEach((r,i)=>{if(r.score!==null)r.rank=i&&r.score.toFixed(2)===out[i-1].score?.toFixed(2)?out[i-1].rank:i+1;});return out;
}
export function studyReport(rows:TrialRow[],config:BenchmarkConfig){return {schema:STUDY_SCHEMA,createdAt:new Date().toISOString(),config,formula:STUDY_FORMULA,baseline:{source:HRPAL_SOURCE,assumption:HRPAL_ASSUMPTION},confidenceInterval:'동일 시드의 두 규격 점수를 먼저 평균한 뒤 시드별 점수의 Student-t 95% CI. 합성 조건에 대한 소표본 근사이며 알고리즘 간 유의성 검정은 아님.',verification:'합성 입력, 1대·1팔레트, 직육면체·정적 제약 및 TCP/그리퍼 경로 근사. 실제 현대 알고리즘, 논문 학습 모델, 실기·IK·진공 파지·동적 붕괴 검증 아님.',summary:studyRanking(rows,config),byCase:Object.fromEntries(config.cases.map(c=>[c,studyRanking(rows,config,c)])),rows};}
