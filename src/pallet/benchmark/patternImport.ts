import { inspectPatternPlacements,patternPlacement } from './hrpal';
import type { PlanningInput,Orientation,Vec3,Dimensions } from '../types';

/** Neutral interchange schema, NOT a parser for an undocumented HRPal native format. */
export interface ExternalPattern {version:1;units:'mm';source:string;entries:{boxId:string;position:Vec3;size:Dimensions;orientation:Orientation}[]}
const rotations:Orientation[]=[0,90,'whd','hwd','hdw','dhw'];
export function importExternalPattern(value:unknown):ExternalPattern {
 if(!value||typeof value!=='object')throw Error('외부 패턴 객체가 필요합니다.');
 const d=value as Record<string,unknown>;
 if(d.version!==1||!['mm','cm'].includes(String(d.units))||!Array.isArray(d.entries)||d.entries.length>10000)throw Error('패턴 버전·단위(mm/cm)·최대 10,000개 항목을 확인하세요.');
 const scale=d.units==='cm'?10:1,ids=new Set<string>();
 const vector=(v:unknown,keys:string[],positive:boolean)=>{
  if(!v||typeof v!=='object')throw Error('패턴 좌표·치수 객체가 필요합니다.');
  const result:Record<string,number>={};
  for(const k of keys){const n=(v as Record<string,unknown>)[k];if(typeof n!=='number'||!Number.isFinite(n*scale)||(positive?n<=0:n<0))throw Error('좌표는 유한한 비음수, 치수는 양수여야 합니다.');result[k]=n*scale;}
  return result;
 };
 const entries=d.entries.map((raw:unknown)=>{
  if(!raw||typeof raw!=='object')throw Error('패턴 항목이 잘못되었습니다.');const e=raw as Record<string,unknown>;
  if(typeof e.boxId!=='string'||!e.boxId||ids.has(e.boxId)||!rotations.includes(e.orientation as Orientation))throw Error('박스 ID 중복·허용 자세 목록을 확인하세요.');ids.add(e.boxId);
  return {boxId:e.boxId,position:vector(e.position,['x','y','z'],false) as unknown as Vec3,size:vector(e.size,['w','d','h'],true) as unknown as Dimensions,orientation:e.orientation as Orientation};
 });
 return {version:1,units:'mm',source:typeof d.source==='string'?d.source:'사용자 외부 패턴',entries};
}
/** The whole export may be known, but only the current arrived object's slot can be used. */
export function planExternalPattern(input:PlanningInput,document:ExternalPattern){
 const start=performance.now(),index=document.entries.findIndex(e=>e.boxId===input.current.id),entry=document.entries[index];
 const prior=new Set(input.placements.map(p=>p.id));let reason='';
 if(!entry)reason='외부 패턴에 현재 도착 박스 ID가 없음';
 else if(document.entries.slice(0,index).some(e=>!prior.has(e.boxId)))reason='외부 패턴의 선행 배치가 미완료 · 도착 순서와 호환되지 않음';
 const proposed=entry?patternPlacement(input,entry.position,entry.orientation):null;
 if(proposed&&entry&&(['w','d','h'] as const).some(k=>Math.abs(entry.size[k]-proposed.size[k])>.001))reason='외부 패턴 치수와 실제 관측 규격 불일치';
 const result=inspectPatternPlacements(input,reason||!proposed?[]:[proposed],proposed?1:0,[`${document.source} · 외부 중립 패턴`, '단위·ID·선행 순서를 확인하고 기존 공통 제약으로 재검증합니다. HRPal 원본 파일 형식 파서는 아직 연결되지 않았습니다.']);
 if(reason){result.rejections[reason]=1;result.explanation.push(reason);}
 result.milliseconds=performance.now()-start;return result;
}
