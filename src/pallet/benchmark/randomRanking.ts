import {rng} from '../scenarios';
import {simpleConfig} from './simpleStudy';
import {sixScores,THREE_IDS,THREE_NAMES,THREE_WEIGHTS,SIX_AXES,AXIS_FORMULAS} from './threeStudy';
import {distribution,fingerprint} from './statistics';
import type {BenchmarkConfig,TrialRow} from './model';
export const RANDOM_RANK_SCHEMA='ALPS-random-ranking/1';
export function randomRankingConfig(seed=42,repeats=100,count=120,height=2200):BenchmarkConfig{
 const c=simpleConfig('wide',count,seed,height,repeats),random=rng(seed^0x3c6ef372);
 const colors=['#8ebec8','#cdb17a','#b1a4d0','#83b59c','#baa39a','#91a9c9'];
 c.scenario.id='simple-random-ranking';c.scenario.name='무작위 혼합 규격 반복시험';
 c.scenario.types=colors.map((color,i)=>({...c.scenario.types[0],id:`R${i+1}`,name:`무작위 규격 ${i+1}`,color,quantity:0,size:{w:300+50*Math.floor(random()*7),d:250+50*Math.floor(random()*5),h:140+20*Math.floor(random()*5)},weight:Math.round((2+random()*8)*10)/10}));
 for(let i=0;i<count;i++)c.scenario.types[Math.floor(random()*colors.length)].quantity++;
 // Scenario data are evaluator-only. The planner still receives current box + remaining type counts.
 c.settings.plannerSeed=(seed^2026)>>>0;
 return c;
}
export function rankingTrialConfig(base:BenchmarkConfig,seed:number){return randomRankingConfig(seed,base.repeats,base.scenario.types.reduce((n,t)=>n+t.quantity,0),base.scenario.pallet.maxHeight);}
export function trialScore(row:TrialRow){if(Object.values(row.hardConstraints??{}).some(h=>h.status==='FAIL'))return null;const axes=sixScores(row);return axes.every(v=>v!==null&&Number.isFinite(v))?axes.reduce<number>((n,v,i)=>n+v!*THREE_WEIGHTS[i],0):null;}
export function rankingCsv(rows:TrialRow[],config:BenchmarkConfig){const {ranking}=rankingSummary(rows,config);return '\ufeff'+['rank,algorithm,n,mean_score,sample_sd,ci95_low,ci95_high,mean_count,mean_utilization_pct,mean_height_mm,mean_p95_ms',...ranking.map((r,i)=>[r.eligible?i+1:'',r.name,r.valid,r.score.mean,r.score.std,...(r.score.ci95??[null,null]),r.metrics.count.mean,r.metrics.utilization.mean,r.metrics.height.mean,r.metrics.p95Ms.mean].join(','))].join('\n');}
export function rankingSummary(rows:TrialRow[],config:BenchmarkConfig){
 const expected=config.repeats;
 const ranking=THREE_IDS.map(id=>{
  const trials=rows.filter(r=>r.algorithm===id),valid=trials.filter(r=>trialScore(r)!==null);
  const metrics=Object.fromEntries(['count','utilization','height','supportMin','p95Ms','workSeconds','completion'].map(k=>[k,distribution(trials.map(r=>r.values[k]))]));
  return {id,name:THREE_NAMES[id],expected,attempted:trials.length,valid:valid.length,invalid:trials.length-valid.length,eligible:trials.length===expected&&valid.length===expected,score:distribution(trials.map(trialScore)),axes:SIX_AXES.map((_,i)=>distribution(trials.map(r=>sixScores(r)[i]))),metrics};
 }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(b.score.mean??-1)-(a.score.mean??-1));
 const leader=ranking.find(r=>r.eligible),paired=leader?ranking.filter(r=>r.id!==leader.id).map(r=>{
  const pairs=rows.filter(x=>x.algorithm===leader.id).flatMap(a=>{const b=rows.find(x=>x.algorithm===r.id&&x.seed===a.seed&&x.fingerprint===a.fingerprint),sa=trialScore(a),sb=b?trialScore(b):null;return sa===null||sb===null?[]:[sa-sb];});
  return {leader:leader.id,other:r.id,difference:distribution(pairs),winRate:pairs.length?100*pairs.filter(d=>d>0).length/pairs.length:null};
 }):[];
 return {ranking,paired};
}
export function rankingReport(rows:TrialRow[],config:BenchmarkConfig){return {schema:RANDOM_RANK_SCHEMA,createdAt:new Date().toISOString(),config,conditions:Array.from({length:config.repeats},(_,episode)=>{const seed=(config.seed+episode)%2147483648,c=rankingTrialConfig(config,seed);return {seed,types:c.scenario.types,arrival:c.scenario.arrival};}),...rankingSummary(rows,config),axes:SIX_AXES,weights:THREE_WEIGHTS,formulas:AXIS_FORMULAS,inputDistribution:{types:6,count:config.scenario.types.reduce((n,t)=>n+t.quantity,0),widthMm:'300~600, 50mm 간격 균등',depthMm:'250~450, 50mm 간격 균등',heightMm:'140~220, 20mm 간격 균등',massKg:'2~10 균등, 0.1kg 반올림',quantity:'각 박스의 종류를 6종에서 균등 추출',arrival:'시드별 무작위 순열',strength:'허용 상부하중 120kg, 합성 가정값',rotation:'세운 상태 0/90도'},identity:fingerprint({config,policy:'paired-random-boxes/1'}),verification:'6축 모델 점수. 정적 지지·하중·기하/TCP 경로 근사만 검사. 실제 IK·진공·동적 안정성 미검증. 오류·시간초과·미검증 축을 0/100점으로 대체하지 않으며 유효 결과가 n개 미만이면 공식 순위를 부여하지 않음. 평균 CI는 Student-t 근사, 동일 시드 차이는 대응표본 비교. 합성 분포 밖의 고객사 성능 보장 없음.',rows:rows.map(r=>({...r,trace:undefined}))};}
