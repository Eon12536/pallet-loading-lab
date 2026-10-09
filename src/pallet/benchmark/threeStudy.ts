import { scenario } from '../scenarios';
import { ArrivalEnvironment,advance,metrics } from '../environment';
import { emptyFrame,ONLINE_SEARCH } from '../types';
import type { Algorithm,BoxType,PlanningInput,Scenario } from '../types';
import { DEFAULT_STRATEGY } from '../strategies/PackingStrategy';
import { auditProposal } from './runner';
import { getAlgorithm } from './registry';
import { evaluatePattern } from '../patternEvaluation';
import { hardResults } from './hardConstraints';
import { distribution,fingerprint,clamp,percentile } from './statistics';
import { BUNDLED_ALGORITHM_VERSION,EVALUATOR_VERSION } from './version';
import type { BenchmarkConfig,Hooks,TrialRow,TrialSpec } from './model';

export const THREE_IDS=['future-hybrid','greedy','random'] as const;
export const THREE_NAMES:Record<string,string>={'future-hybrid':'Future-Aware Hybrid',greedy:'Greedy',random:'무작위 배치'};
export const THREE_SCHEMA='ALPS-three-model/2';
export const THREE_DEFAULT_COUNT=120;
export const THREE_DEFAULT_HEIGHT=2200;
export type ThreeProfile='mixed'|'identical'|'wide';
export const SIX_AXES=['적재 완료율','공간 밀도','최소 지지율','하중 균형','작업 효율','계산 속도'] as const;
export const AXIS_FORMULAS=['적재 수 / 전체 공급 수 × 100','적재 부피 / (바닥 면적 × 실제 적재 높이) × 100','모든 적재 박스의 최소 바닥 지지율 × 100','(1 − 바닥 하중 불균형) × 100','clamp((40 − 추정 작업 초/박스) / 35) × 100','100 / (1 + 실측 P95 판단시간 / 100ms)'];
export const THREE_WEIGHTS=[.4,.2,.15,.1,.1,.05];
export function threeScenario(profile:ThreeProfile='wide',count=THREE_DEFAULT_COUNT,seed=42,height=THREE_DEFAULT_HEIGHT):Scenario{
 if(!Number.isInteger(count)||count<12||count>120||!Number.isInteger(seed)||seed<0||seed>2147483647||!Number.isFinite(height)||height<600||height>2200)throw Error('박스 12~120개, 유효한 시드, 높이 600~2200 mm를 입력하세요.');
 const s=scenario('online-task',seed);delete s.generation;s.id=profile==='wide'?'three-model-wide':'three-model';s.name=profile==='wide'?'높게 쌓기 · 넓은 혼합 박스':profile==='mixed'?'혼합 규격':'동일 규격';
 s.pallet={width:1000,depth:800,maxHeight:height,palletsPerRobot:1,robotLayout:{count:1,architecture:'floor',floorCount:1}};
 s.arrival={seed,pattern:'shuffle'};s.events=[];s.supplyMode='arrival';
 const box=(id:string,w:number,d:number,h:number,weight:number,color:string):BoxType=>({id,name:id,size:{w,d,h},weight,color,quantity:0,orientations:[0,90],material:'plastic',maxLoadKg:120,strengthFactor:1});
 s.types=profile==='wide'?[box('A',400,400,180,3,'#8ebec8'),box('B',600,400,180,4,'#cdb17a'),box('C',500,400,180,6,'#b1a4d0'),box('D',400,400,180,4,'#83b59c')]:profile==='identical'?[box('A',200,200,180,3,'#8ebec8')]:[box('A',200,200,180,3,'#8ebec8'),box('B',300,200,180,4,'#cdb17a'),box('C',400,200,180,6,'#b1a4d0'),box('D',250,200,180,4,'#83b59c')];
 s.types.forEach((t,i)=>t.quantity=Math.floor(count/s.types.length)+(i<count%s.types.length?1:0));
 // Preserve hard support, transmitted-CG, load, height and gripper path checks.
 // Existing online profile treats aspect ratio as a preference, not a force-balance law.
 s.constraints.standingHeight={enabled:true,maxRiseMm:240};s.constraints.supportRatio=.95;s.constraints.gripper.payload=35;
 return s;
}
export function threeConfig(profile:ThreeProfile='wide',count=THREE_DEFAULT_COUNT,seed=42,height=THREE_DEFAULT_HEIGHT,repeats=3):BenchmarkConfig{
 return {scenario:threeScenario(profile,count,seed,height),settings:{...structuredClone(ONLINE_SEARCH),plannerSeed:2026,maxCandidates:48,temporaryBuffer:false,strategy:{...structuredClone(DEFAULT_STRATEGY),futureCandidates:8,lookaheadDepth:2,lookaheadSamples:3,lookaheadCandidates:4}},algorithms:[...THREE_IDS],cases:[profile==='wide'?'mixed':profile],seed,repeats,decisionMs:60000,trialMs:300000,probeLimit:0,includeOffline:false,warmupRuns:1};
}
/** Same sequential arrivals, one shared holding queue. No pallet replacement operation exists. */
export async function runThreeTrial(c:BenchmarkConfig,spec:TrialSpec,hooks:Hooks={}):Promise<TrialRow>{
 if(!THREE_IDS.includes(spec.algorithm as typeof THREE_IDS[number]))throw Error('이 실험은 세 알고리즘만 실행합니다.');
 const s=structuredClone(c.scenario);s.arrival.seed=spec.seed;const env=new ArrivalEnvironment(s);
 const arrivals=Array.from({length:env.total},(_,i)=>env.current(i)!);
 const now=hooks.now??(()=>performance.now()),start=now(),definition=getAlgorithm(spec.algorithm),times:number[]=[];
 const row:TrialRow={id:`${spec.caseId}:${spec.seed}:${spec.algorithm}`,algorithm:spec.algorithm,algorithmVersion:definition.version??BUNDLED_ALGORITHM_VERSION,evaluatorVersion:EVALUATOR_VERSION,scope:'online',caseId:spec.caseId,seed:spec.seed,episode:spec.episode,fingerprint:fingerprint({scenario:s,settings:c.settings,policy:'defer-full-pass/1'}),arrivalIds:arrivals.map(b=>b.id),outcome:'partial',reason:'',values:{},proposalViolations:{},candidateRejections:{},proposalReasons:[],exceptions:[],strength:'explicit',robot:'proxy',pallet:s.pallet,constraints:s.constraints,trace:[]};
 let frame=emptyFrame(),pending=[...arrivals],attempts=0,passes=0,candidates=0;
 try{
  while(pending.length){
   const held:typeof pending=[];let placedThisPass=0;passes++;
   for(let index=0;index<pending.length;index++){
    if(hooks.aborted?.())throw Error('실행 취소');
    if(now()-start>c.trialMs){row.outcome='timeout';row.reason='실험 시간 한도 초과';break;}
    const current=pending[index],remaining=Object.fromEntries(s.types.map(t=>[t.id,0]));
    // Counts of unplaced stock are public; actual future arrival ordering is never passed to a model.
    for(const b of [...held,...pending.slice(index+1)])remaining[b.typeId]++;
    const input:PlanningInput={runId:row.id,stepId:frame.processed,pallet:s.pallet,types:s.types,constraints:s.constraints,placements:structuredClone(frame.placements),current:structuredClone(current),remaining,algorithm:spec.algorithm as Algorithm,settings:structuredClone(c.settings),strategyState:structuredClone([...frame.records].reverse().find(r=>r.disposition==='placed'&&r.analysis?.strategyState)?.analysis?.strategyState)};
    attempts++;await hooks.beforeDecision?.(attempts);const begin=now();let analysis;
    try{analysis=definition.plan(input);}finally{hooks.afterDecision?.(attempts);}
    const elapsed=now()-begin;times.push(elapsed);analysis.milliseconds=elapsed;
    if(elapsed>c.decisionMs){row.outcome='timeout';row.reason='판단 시간 한도 초과';break;}
    candidates+=analysis.checkedCandidates??analysis.candidates.length;
    const bad=auditProposal(input,analysis);
    if(bad.length){row.outcome='constraint-rejected';row.proposalReasons=bad;row.reason=bad.join(' / ');row.proposalViolations.protocol=1;break;}
    const before=frame,next=advance(frame,input,analysis),rec=next.records.at(-1)!;
    if(analysis.selectedId!==null&&rec.disposition!=='placed')throw Error('확정 검사에서 선택 배치가 거절됨: '+rec.reason);
    if(rec.disposition==='placed'){frame=next;placedThisPass++;}
    else{held.push(current);frame={...before,records:next.records,blocked:false,reason:''};}
    const m=metrics(frame,s);
    row.trace!.push({step:attempts,box:rec.observation,placement:rec.placement,path:rec.path,decisionMs:elapsed,disposition:rec.disposition==='placed'?'placed':'deferred',reason:rec.reason,center:m.center,minSupport:frame.placements.length?Math.min(...frame.placements.map(p=>p.supportRatio)):null,minMargin:null,pallet:s.pallet});
    if(rec.analysis)rec.analysis={...rec.analysis,candidates:rec.analysis.candidates.filter(can=>can.id===rec.analysis!.selectedId)};
   }
   if(['timeout','constraint-rejected'].includes(row.outcome))break;
   pending=held;
   // A complete unchanged pass must reject EVERY remaining box. A layer or a clock is not a stop signal.
   if(!placedThisPass){row.reason='남은 박스 전부가 현재 후보·지지·하중·높이·경로 검사에서 배치 불가. 팔레트를 유지합니다.';break;}
  }
 }catch(e){row.outcome='error';row.reason=e instanceof Error?e.message:String(e);}
 const m=metrics(frame,s),audit=evaluatePattern(frame,s);
 row.finalReasons=audit.reasons;
 if(audit.reasons.length){row.outcome='constraint-rejected';row.reason=audit.reasons.join(' / ');}
 else if(!['error','timeout','constraint-rejected'].includes(row.outcome))row.outcome=m.count===arrivals.length?'complete':m.count?'partial':'no-placement';
 if(row.outcome==='complete')row.reason='공급 박스를 모두 적재했습니다. 완료된 팔레트를 그대로 유지합니다.';
 const support=frame.placements.map(p=>p.supportRatio);
 row.values={count:m.count,completion:100*m.count/arrivals.length,utilization:100*m.utilization,density:100*m.efficiency,height:m.height,comZ:m.count?m.center.z:null,supportMin:support.length?100*Math.min(...support):null,imbalance:m.count?100*m.imbalance:null,workSeconds:m.count?m.workSeconds:null,meanMs:times.length?times.reduce((a,b)=>a+b,0)/times.length:null,p95Ms:percentile(times,.95),totalMs:times.reduce((a,b)=>a+b,0),unplaced:arrivals.length-m.count,pallets:1,shipments:0,attempts,passes,candidates};
 row.hardConstraints=hardResults(row);hooks.progress?.(row);return row;
}
export function sixScores(r:TrialRow):(number|null)[]{
 if(['timeout','error','constraint-rejected','environment-blocked'].includes(r.outcome)||(r.finalReasons?.length??0)>0)return Array(6).fill(null);
 const v=r.values,count=v.count??0;
 return [v.completion??null,v.density??null,v.supportMin??null,v.imbalance==null?null:100*clamp(1-v.imbalance/100),count&&v.workSeconds!=null?100*clamp((40-v.workSeconds/count)/35):null,v.p95Ms==null?null:100/(1+v.p95Ms/100)];
}
export function threeSummaries(rows:TrialRow[],config:BenchmarkConfig){
 return THREE_IDS.map(algorithm=>{
  const rr=rows.filter(r=>r.algorithm===algorithm),complete=rr.length===config.repeats*config.cases.length;
  const vectors=rr.map(sixScores),scores=SIX_AXES.map((_,i)=>complete&&vectors.every(v=>v[i]!=null)?distribution(vectors.map(v=>v[i])).mean:null);
  const score=scores.every(v=>v!=null)?scores.reduce<number>((n,v,i)=>n+v!*THREE_WEIGHTS[i],0):null;
  const metric=(k:string)=>distribution(rr.map(r=>r.values[k]??null)).mean;
  return {algorithm,name:THREE_NAMES[algorithm],scores,score,trials:rr.length,expected:config.repeats*config.cases.length,count:metric('count'),height:metric('height'),p95Ms:metric('p95Ms'),workSeconds:metric('workSeconds'),completion:metric('completion'),full:rr.filter(r=>r.outcome==='complete').length};
 });
}
export function threeReport(rows:TrialRow[],config:BenchmarkConfig){return {schema:THREE_SCHEMA,createdAt:new Date().toISOString(),config,axes:SIX_AXES,axisFormulas:AXIS_FORMULAS,weights:THREE_WEIGHTS,summary:threeSummaries(rows,config),policy:'한 팔레트 유지. 배치 불가 박스 보류 후 재시도. 공급 완료 또는 남은 전부가 같은 상태에서 배치 불가일 때만 종료. 자동 반출 없음.',verification:'합성 입력·공통 기하/정적 제약·TCP 경로 근사. 관절 IK·진공 파지·동적 붕괴는 미검증. 계산 속도는 측정 기기에 따라 달라집니다.',rows};}
