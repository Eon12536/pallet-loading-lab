import { METRICS } from './metrics';
import type { BenchmarkConfig,TrialRow,Area,Thresholds } from './model';
import { aggregate } from './scoring';
import { algorithmRegistry } from './registry';
export function report(config:BenchmarkConfig,rows:TrialRow[],weights:Record<Area,number>,thresholds:Thresholds,environment:unknown){return {schema:'PAC-Benchmark/1',createdAt:new Date().toISOString(),units:{length:'mm',mass:'kg',time:'ms / s',volume:'m³'},config,weights,thresholds,environment,verification:'직육면체·정적 하중·기하 경로 근사. IK, 진공 파지, 압축 파손, 동적 붕괴 미검증',algorithms:algorithmRegistry().map(({plan:_,...r})=>r),metrics:METRICS,summary:aggregate(rows,weights,thresholds).map(({rows:_,...r})=>r),trials:aggregate(rows,weights,thresholds).flatMap(r=>r.rows)};}
const cell=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
export function csv(rows:TrialRow[]){const keys=METRICS.map(m=>m.key);return '\ufeff'+[['algorithm','scope','scenario','seed','episode','fingerprint','outcome','reason','strength','robot','proposalViolations','candidateRejections',...keys],...rows.map(r=>[r.algorithm,r.scope,r.caseId,r.seed,r.episode,r.fingerprint,r.outcome,r.reason,r.strength,r.robot,JSON.stringify(r.proposalViolations),JSON.stringify(r.candidateRejections),...keys.map(k=>r.values[k])])].map(r=>r.map(cell).join(',')).join('\r\n');}
export function download(name:string,text:string,type:string){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
