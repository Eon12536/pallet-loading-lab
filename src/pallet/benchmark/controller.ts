import { validateBenchmark } from './scenarios';
import { failedTrial } from './runner';
import type { BenchmarkConfig,TrialSpec,TrialRow } from './model';
export function trialList(c:BenchmarkConfig){validateBenchmark(c);const jobs:TrialSpec[]=[];
 for(let episode=0;episode<c.repeats;episode++)for(const caseId of c.cases){const ids=[...c.algorithms,...(c.includeOffline&&!['missing','resize','damaged','palletChange'].includes(caseId)?['offline-stock']:[])];for(const algorithm of ids)jobs.push({algorithm,caseId,seed:(c.seed+episode)%2147483648,episode});}return jobs;
}
export interface BenchmarkProgress {done:number;total:number;active?:TrialSpec;step?:number;state:'running'|'paused'|'cancelled'|'complete'}
/** One isolated worker trial at a time. A watchdog kills synchronous planners that cannot yield. */
export class BenchmarkController {
 private worker:Worker|null=null;private cancelled=false;private paused=false;private wake:(()=>void)|null=null;private abortTrial:(()=>void)|null=null;
 pause(value:boolean){this.paused=value;if(!value){this.wake?.();this.wake=null;}}
 cancel(){this.cancelled=true;this.worker?.terminate();this.worker=null;this.abortTrial?.();this.wake?.();}
 async run(input:BenchmarkConfig,onRow:(r:TrialRow)=>void,onProgress:(p:BenchmarkProgress)=>void){
  const c=structuredClone(input),jobs=trialList(c);let done=0;
  for(const spec of jobs){
   if(this.cancelled)break;
   if(this.paused){onProgress({done,total:jobs.length,state:'paused'});await new Promise<void>(r=>this.wake=r);}
   if(this.cancelled)break;
   onProgress({done,total:jobs.length,active:spec,state:'running'});
   const row=await new Promise<TrialRow|null>(resolve=>{
    const id=`${done}:${spec.seed}`,worker=this.worker??new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});this.worker=worker;let settled=false,decisionTimer:ReturnType<typeof setTimeout>|undefined;
    const finish=(row:TrialRow|null,kill=false)=>{if(settled)return;settled=true;clearTimeout(trialTimer);clearTimeout(decisionTimer);worker.onmessage=null;worker.onerror=null;this.abortTrial=null;if(kill){worker.terminate();this.worker=null;}resolve(row);};
    const trialTimer=setTimeout(()=>finish(failedTrial(c,spec,'전체 실행 시간 예산 초과 · Worker 중단'),true),c.trialMs+2000);
    this.abortTrial=()=>finish(null,true);
    worker.onerror=()=>finish(failedTrial(c,spec,'평가 Worker 오류','error'),true);
    worker.onmessage=event=>{const m=event.data;if(m.id!==id||settled)return;
     if(m.type==='decision-start'){onProgress({done,total:jobs.length,active:spec,step:m.step,state:'running'});clearTimeout(decisionTimer);decisionTimer=setTimeout(()=>finish(failedTrial(c,spec,'판단 시간 예산 초과 · Worker 중단'),true),c.decisionMs+500);}
     if(m.type==='decision-end')clearTimeout(decisionTimer);
     if(m.type==='result')finish(m.row);if(m.type==='error')finish(failedTrial(c,spec,m.message,'error'),true);
    };worker.postMessage({id,config:c,spec});
   });
   if(row){onRow(row);done++;}if(this.cancelled)break;
  }
  this.worker?.terminate();this.worker=null;onProgress({done,total:jobs.length,state:this.cancelled?'cancelled':'complete'});
 }
}
