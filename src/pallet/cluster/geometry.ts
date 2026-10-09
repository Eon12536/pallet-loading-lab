// Port of the locally supplied ALPS floor geometry. No rollout in cluster-layer.
import { candidateOrigins } from '../candidates';
import { frontierOrigins, balancedOrigins, geometricFeasible, type RawCandidate } from '../frontier';
import { inspectConstraints } from '../constraints';
import { allowedOrientations } from '../orientations';
import { oriented, landingHeight, top, EPS } from '../geometry';
import { features, terms } from '../features';
import type { Candidate, Observation, Placement, PlanningInput } from '../types';

export const DENSE_POLICY_VERSION='floor-dense/2';
export const DENSE_PRIORITY=[
 'lowest placement bottom z', 'least exact newly buried column void',
 'least narrow side-strip proxy', 'most side contact with the same top height',
 'most box-side / pallet-edge contact', 'smallest occupied XY bounding rectangle',
 'lowest global top', 'smallest horizontal cargo CoG offset', 'lowest cargo CoG',
 'deterministic y, x and orientation tie break',
] as const;
/** Newly covered air between the previous local skyline and this box bottom.
 * Exact footprint-cell integration, excluding pre-existing cavities under older boxes.
 */
export function newColumnVoid(box:Placement,stack:Placement[]):number{
 if(box.position.z<=EPS)return 0;
 const left=box.position.x,right=left+box.size.w,front=box.position.y,back=front+box.size.d;
 const overlapping=stack.filter(p=>p.position.x<right-EPS&&p.position.x+p.size.w>left+EPS&&p.position.y<back-EPS&&p.position.y+p.size.d>front+EPS);
 const xs=[...new Set([left,right,...overlapping.flatMap(p=>[Math.max(left,p.position.x),Math.min(right,p.position.x+p.size.w)])])].sort((a,b)=>a-b);
 const ys=[...new Set([front,back,...overlapping.flatMap(p=>[Math.max(front,p.position.y),Math.min(back,p.position.y+p.size.d)])])].sort((a,b)=>a-b);
 let amount=0;
 for(let x=1;x<xs.length;x++)for(let y=1;y<ys.length;y++){
  const mx=(xs[x]+xs[x-1])/2,my=(ys[y]+ys[y-1])/2;
  const before=Math.max(0,...overlapping.filter(p=>mx>=p.position.x&&mx<p.position.x+p.size.w&&my>=p.position.y&&my<p.position.y+p.size.d).map(top));
  amount+=(xs[x]-xs[x-1])*(ys[y]-ys[y-1])*Math.max(0,box.position.z-before);
 }
 return amount;
}
function faceContacts(box:Placement,input:PlanningInput){
 const p=box.position,s=box.size,pallet=input.pallet;
 let contact=0,sameTop=0;
 // Pallet edges are virtual packing boundaries, not load-bearing walls.
 if(Math.abs(p.x)<EPS)contact+=s.d*s.h;if(Math.abs(p.x+s.w-pallet.width)<EPS)contact+=s.d*s.h;
 if(Math.abs(p.y)<EPS)contact+=s.w*s.h;if(Math.abs(p.y+s.d-pallet.depth)<EPS)contact+=s.w*s.h;
 for(const other of input.placements){
  const dz=Math.max(0,Math.min(top(box),top(other))-Math.max(p.z,other.position.z));if(dz<=EPS)continue;
  let length=0;
  if(Math.abs(p.x+s.w-other.position.x)<EPS||Math.abs(other.position.x+other.size.w-p.x)<EPS)length+=Math.max(0,Math.min(p.y+s.d,other.position.y+other.size.d)-Math.max(p.y,other.position.y));
  if(Math.abs(p.y+s.d-other.position.y)<EPS||Math.abs(other.position.y+other.size.d-p.y)<EPS)length+=Math.max(0,Math.min(p.x+s.w,other.position.x+other.size.w)-Math.max(p.x,other.position.x));
  contact+=length*dz;if(Math.abs(top(other)-top(box))<EPS)sameTop+=length;
 }
 return {contact,sameTop};
}
/** Finite side-strip heuristic: narrow gaps between this box and an adjacent side
 * obstacle/wall, compared with the smallest known remaining footprint width/depth.
 * Corner strips can overlap. This is a tie-breaking proxy, not inaccessible area.
 */
function narrowSideStrips(box:Placement,input:PlanningInput){
 const remaining=input.types.filter(t=>(input.remaining[t.id]??0)>0);
 if(!remaining.length)return 0;
 const sizes=remaining.flatMap(t=>allowedOrientations(t.size,t.orientations,t.handling,t.maxLoadByAxis).map(o=>oriented(t.size,o)));
 const minX=Math.min(...sizes.map(s=>s.w)),minY=Math.min(...sizes.map(s=>s.d));
 let total=0;
 for(const axis of ['x','y'] as const){
  const along=axis==='x'?'y':'x',width=axis==='x'?'w':'d',length=axis==='x'?'d':'w',limit=axis==='x'?input.pallet.width:input.pallet.depth,min=axis==='x'?minX:minY;
  const start=box.position[along],end=start+box.size[length];
  const neighbors=input.placements.filter(p=>top(p)>box.position.z+EPS&&p.position.z<top(box)-EPS&&p.position[along]<end-EPS&&p.position[along]+p.size[length]>start+EPS);
  const edges=[...new Set([start,end,...neighbors.flatMap(p=>[Math.max(start,p.position[along]),Math.min(end,p.position[along]+p.size[length])])])].sort((a,b)=>a-b);
  for(let i=1;i<edges.length;i++){
   const mid=(edges[i]+edges[i-1])/2,cover=neighbors.filter(p=>mid>=p.position[along]&&mid<p.position[along]+p.size[length]);
   let before=box.position[axis],after=limit-box.position[axis]-box.size[width];
   for(const p of cover){const right=p.position[axis]+p.size[width];if(right<=box.position[axis]+EPS)before=Math.min(before,box.position[axis]-right);if(p.position[axis]>=box.position[axis]+box.size[width]-EPS)after=Math.min(after,p.position[axis]-box.position[axis]-box.size[width]);}
   for(const gap of [before,after])if(gap>EPS&&gap<min-EPS)total+=gap*(edges[i]-edges[i-1]);
  }
 }
 return total;
}
export function denseRank(box:Placement,input:PlanningInput):number[]{
 const stack=[...input.placements,box],mass=stack.reduce((s,p)=>s+p.weight,0);
 const cx=stack.reduce((s,p)=>s+p.weight*(p.position.x+p.size.w/2),0)/mass,cy=stack.reduce((s,p)=>s+p.weight*(p.position.y+p.size.d/2),0)/mass,cz=stack.reduce((s,p)=>s+p.weight*(p.position.z+p.size.h/2),0)/mass;
 const bounds=(Math.max(...stack.map(p=>p.position.x+p.size.w))-Math.min(...stack.map(p=>p.position.x)))*(Math.max(...stack.map(p=>p.position.y+p.size.d))-Math.min(...stack.map(p=>p.position.y)));
 const contacts=faceContacts(box,input);
 return [box.position.z,newColumnVoid(box,input.placements),narrowSideStrips(box,input),-contacts.sameTop,-contacts.contact,bounds,Math.max(...stack.map(top)),Math.hypot(cx-input.pallet.width/2,cy-input.pallet.depth/2),cz,box.position.y,box.position.x,box.orientation===0?0:1];
}
export function compareDenseRank(a:readonly number[],b:readonly number[]):number{
 for(let i=0;i<a.length;i++){const delta=a[i]-b[i];if(Math.abs(delta)>1e-7)return delta;}return 0;
}
const originKey=(r:RawCandidate)=>[r.position.x,r.position.y,r.position.z,r.size.w,r.size.d,r.size.h,r.orientation].join(':');
export function extraOrigins(input:PlanningInput,deadline:number){
 const raw:RawCandidate[]=[],clock=()=>performance.now();let complete=true;
 for(const orientation of allowedOrientations(input.current.size,input.current.orientationAllowed,input.current.handling,input.current.maxLoadByAxis)){
  if(clock()>=deadline){complete=false;break;}
  const size=oriented(input.current.size,orientation),base=frontierOrigins(input.pallet,size,input.placements,input.constraints.horizontalGap);
  raw.push(...base.map(position=>({position,size,orientation})));
  const balance=balancedOrigins(size,input.placements,input.current.weight),cx=(input.pallet.width-size.w)/2,cy=(input.pallet.depth-size.d)/2;
  balance.push({x:cx,y:cy,z:landingHeight(cx,cy,size,input.placements)});raw.push(...balance.map(position=>({position,size,orientation,balanceTarget:true})));
  // Exact edge-aligned coordinates plus midpoints between adjacent legal origin
  // coordinates expose corridor centers omitted by the original edge-only pool.
  const xs=[...new Set(base.map(p=>p.x).filter(x=>x>=0&&x+size.w<=input.pallet.width))].sort((a,b)=>a-b),ys=[...new Set(base.map(p=>p.y).filter(y=>y>=0&&y+size.d<=input.pallet.depth))].sort((a,b)=>a-b);
  const middle=(a:number[])=>a.slice(1).map((v,i)=>(v+a[i])/2),mx=middle(xs),my=middle(ys);
  for(const x of [...xs,...mx]){
   if(clock()>=deadline){complete=false;break;}
   for(const y of [...ys,...my])raw.push({position:{x,y,z:landingHeight(x,y,size,input.placements)},size,orientation});
  }
 }
 return {raw:[...new Map(raw.map(r=>[originKey(r),r])).values()].sort((a,b)=>a.position.z-b.position.z||a.position.y-b.position.y||a.position.x-b.position.x),complete};
}
export function fromOrigin(raw:RawCandidate,input:PlanningInput):Placement{
 const o=input.current;return {id:o.id,typeId:o.typeId,position:{...raw.position},size:{...raw.size},orientation:raw.orientation,weight:o.weight,supports:[],supportRatio:0,loadAbove:0,
  packaging:o.packaging,maxLoadKg:o.maxLoadKg,maxLoadSource:o.maxLoadSource,maxLoadByAxis:o.maxLoadByAxis,material:o.material,handling:o.handling,strengthFactor:o.strengthFactor,friction:o.friction};
}
