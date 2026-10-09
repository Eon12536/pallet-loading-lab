import { inspectConstraints } from '../constraints';
import { features,terms } from '../features';
import { intersects,oriented,top } from '../geometry';
import { surface } from '../surface';
import type { Analysis,Candidate,PlanningInput,Placement,Orientation } from '../types';

export const HRPAL_SOURCE='https://www.hd-hyundairobotics.com/biz/product/support/287';
export const HRPAL_NAME='Conventional Pattern-Based Palletizing (HRPal-style Baseline)';
export const HRPAL_ASSUMPTION='산업용 고정 레이어 패턴을 직접 구현한 기준선입니다. HRPal 공개 패턴 생성·관리 기능에서 착안했으며, 비공개 내부 알고리즘의 복제나 실제 HRPal 성능을 뜻하지 않습니다.';
export type LayerPattern='column'|'interlocking'|'brick';
export const PATTERN_NAMES:Record<LayerPattern,string>={column:'Column Stack · 수직 정렬',interlocking:'Interlocking · 층별 교차',brick:'Brick Pattern · 엇갈림'};
export interface PatternSlot {x:number;y:number;z:number;orientation:0|90;layer:number;group:string}
const specKey=(b:Pick<Placement,'size'>)=>`${b.size.w}/${b.size.d}/${b.size.h}`;

/** Fixed grid cells, including local layer grids on observed mixed-spec top faces.
 * Never frontier-search, shrink sizes, select future arrivals or relax constraints. */
export function patternSlots(input:PlanningInput,pattern:LayerPattern):{slots:PatternSlot[];generated:number;groups:number;capped:boolean}{
 const {pallet,current,placements,constraints,settings}=input,gap=constraints.horizontalGap;
 const levels=[...new Set([0,...placements.map(top)])].sort((a,b)=>a-b);
 const rotations=([0,90] as const).filter(o=>current.orientationAllowed.includes(o));
 const slots:PatternSlot[]=[],seen=new Set<string>(),groups=new Set(placements.map(specKey));let generated=0;
 const limit=Math.max(1,Math.floor(settings.maxCandidates));
 for(let layer=0;layer<levels.length;layer++){
  const z=levels[layer];
  const regions=[{x:0,y:0,w:pallet.width,d:pallet.depth,group:'팔레트 격자'},...placements.filter(p=>Math.abs(top(p)-z)<.001).map(p=>({x:p.position.x,y:p.position.y,w:p.size.w,d:p.size.d,group:specKey(p)}))];
  regions.sort((a,b)=>b.w*b.d-a.w*a.d||a.x-b.x||a.y-b.y);
  for(const region of regions){
   const poses=rotations.map(orientation=>{const size=oriented(current.size,orientation);return {orientation,size,capacity:Math.floor((region.w+gap)/(size.w+gap))*Math.floor((region.d+gap)/(size.d+gap))};}).sort((a,b)=>pattern==='interlocking'?Number(b.orientation===(layer%2?90:0))-Number(a.orientation===(layer%2?90:0))||b.capacity-a.capacity:b.capacity-a.capacity||a.orientation-b.orientation);
   for(const {orientation,size} of poses){
    const ny=Math.floor((region.d+gap)/(size.d+gap));
    for(let row=0;row<ny&&generated<limit*32;row++){
     const offset=pattern==='brick'&&(row+layer)%2?size.w/2:0;
     const nx=Math.max(0,Math.floor((region.w-offset+gap)/(size.w+gap)));
     for(let col=0;col<nx&&generated<limit*32;col++){
      generated++;
      if(slots.length>=limit)break;
      const x=region.x+offset+(row%2?nx-1-col:col)*(size.w+gap),y=region.y+row*(size.d+gap);
      const key=`${x}/${y}/${z}/${orientation}`;if(seen.has(key))continue;seen.add(key);
      if(placements.some(p=>intersects({position:{x,y,z},size},p)))continue;
      slots.push({x,y,z,orientation,layer,group:region.group});
     }
    }
   }
  }
 }
 return {slots,generated,groups:groups.size,capped:slots.length>=limit||generated>=limit*32};
}

/** External patterns use this same evaluator, too. */
export function inspectPatternPlacements(input:PlanningInput,origins:Placement[],generated:number,explanation:string[]):Analysis {
 const start=performance.now(),{pallet,current,placements,constraints,settings}=input;
 const base=surface(placements,pallet),rejections:Record<string,number>={};
 const candidates:Candidate[]=origins.map((p,i)=>{
  const check=inspectConstraints(p,current,placements,pallet,constraints),f=features(check.stack,pallet,check.path.seconds,{...input,settings:{...settings,inventoryMode:'none'}},base),t=terms(f,pallet,settings.weights,constraints.stability);
  for(const reason of check.reasons)rejections[reason]=(rejections[reason]??0)+1;
  return {id:`pattern-${i}`,placement:check.placement,valid:check.reasons.length===0,reasons:check.reasons,path:check.path,features:f,terms:t,fastScore:0,score:0,future:null};
 });
 const chosen=candidates.find(c=>c.valid);
 return {runId:input.runId,stepId:input.stepId,selectedId:chosen?.id??null,candidates,generated,valid:candidates.filter(c=>c.valid).length,rejections,nodes:candidates.length,rolloutCalls:0,milliseconds:performance.now()-start,capped:false,virtualSequences:[],explanation};
}
export function patternPlacement(input:PlanningInput,position:Placement['position'],orientation:Orientation):Placement {
 return {...input.current,position,size:oriented(input.current.size,orientation),orientation,supports:[],supportRatio:0,loadAbove:0};
}
export function planHrpalInferred(input:PlanningInput,pattern:LayerPattern=input.settings.conventionalPattern??'column'):Analysis {
 const start=performance.now(),r=patternSlots(input,pattern);
 const analysis=inspectPatternPlacements(input,r.slots.map(s=>patternPlacement(input,{x:s.x,y:s.y,z:s.z},s.orientation)),r.generated,[HRPAL_ASSUMPTION,`${PATTERN_NAMES[pattern]} · 관측 규격 그룹 ${r.groups}`, '낮은 층 우선 → 큰 지지면 우선 → 사전 정의 격자 순서. 현재 도착 박스만 배치하며, 큰·무거운 미입고 박스를 먼저 꺼내지 않습니다.']);
 if(!r.slots.length){
  const yaw=input.current.orientationAllowed.filter(o=>o===0||o===90);
  const fits=yaw.some(o=>{const s=oriented(input.current.size,o);return s.w<=input.pallet.width&&s.d<=input.pallet.depth;});
  analysis.rejections[!yaw.length?'지원하는 수평 0°/90° 패턴이 없음':!fits?'박스가 팔레트 격자 공간보다 큼':'고정 패턴의 빈 슬롯이 없음 · 격자 점유 또는 탐색 상한']=1;
 }
 if(analysis.selectedId===null)analysis.explanation.push('패턴 배치 불가: 자유 공간 탐색으로 전환하지 않습니다. 회전·잔여 격자·지지·하중·경로 탈락 사유를 확인하세요.');
 analysis.capped=r.capped;analysis.milliseconds=performance.now()-start;return analysis;
}
