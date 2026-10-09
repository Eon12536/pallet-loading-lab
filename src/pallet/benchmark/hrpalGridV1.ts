import { inspectConstraints } from '../constraints';
import { features,terms } from '../features';
import { oriented,top } from '../geometry';
import { surface } from '../surface';
import type { Analysis,Candidate,PlanningInput,Placement } from '../types';

export const HRPAL_SOURCE='https://www.hd-hyundairobotics.com/biz/product/support/287';
export const HRPAL_ASSUMPTION='HRPal 공개 기능에서 착안한 반복 격자·층 패턴 기준선. 실제 내부 알고리즘·최적화·성능을 재현한 구현이 아닙니다. 혼합 규격에도 같은 규칙을 적용하며 별도 폴백은 없습니다.';
// Public evidence supports pattern generation, not these private implementation choices.
// Our explicit assumptions: upright 0/90°, package-sized grid, serpentine traversal,
// observed support heights, no lookahead. All accepted placements use shared checks.
export function planHrpalGridV1(input:PlanningInput):Analysis {
 const start=performance.now(),{pallet,current,placements,constraints,settings}=input;
 const gap=constraints.horizontalGap,levels=[...new Set([0,...placements.map(top)])].sort((a,b)=>a-b);
 const patterns=([0,90] as const).filter(o=>current.orientationAllowed.includes(o)).map(orientation=>{
  const size=oriented(current.size,orientation),nx=Math.floor((pallet.width+gap)/(size.w+gap)),ny=Math.floor((pallet.depth+gap)/(size.d+gap));
  return {orientation,size,nx,ny,capacity:nx*ny};
 }).sort((a,b)=>b.capacity-a.capacity||a.orientation-b.orientation);
 const origins:Placement[]=[],limit=settings.maxCandidates;
 let generated=0;
 for(const z of levels)for(const p of patterns){
  generated+=p.capacity;
  for(let row=0;row<p.ny&&origins.length<limit;row++)for(let col=0;col<p.nx&&origins.length<limit;col++){
   const x=(row%2?p.nx-1-col:col)*(p.size.w+gap),y=row*(p.size.d+gap);
   origins.push({...current,id:current.id,typeId:current.typeId,position:{x,y,z},size:p.size,orientation:p.orientation,supports:[],supportRatio:0,loadAbove:0});
  }
 }
 const base=surface(placements,pallet),rejections:Record<string,number>={};
 const candidates:Candidate[]=origins.map((p,i)=>{
  const check=inspectConstraints(p,current,placements,pallet,constraints),f=features(check.stack,pallet,check.path.seconds,{...input,settings:{...settings,inventoryMode:'none'}},base),t=terms(f,pallet,settings.weights,constraints.stability);
  for(const reason of check.reasons)rejections[reason]=(rejections[reason]??0)+1;
  return {id:`pattern-${i}`,placement:check.placement,valid:check.reasons.length===0,reasons:check.reasons,path:check.path,features:f,terms:t,fastScore:0,score:0,future:null};
 });
 const chosen=candidates.find(c=>c.valid);
 return {runId:input.runId,stepId:input.stepId,selectedId:chosen?.id??null,candidates,generated,valid:candidates.filter(c=>c.valid).length,rejections,nodes:candidates.length,rolloutCalls:0,milliseconds:performance.now()-start,capped:generated>limit,virtualSequences:[],explanation:[HRPAL_ASSUMPTION,'관측된 층 높이 → 층당 수량이 큰 회전 → 행별 왕복 순서. 현재 박스만 사용하고 확정 위치를 변경하지 않습니다.']};
}
