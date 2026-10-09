// ALPS supplied source port; guide uses position+size de-duplication.
import {candidateOrigins} from '../candidates';
import {geometricFeasible} from '../frontier';
import {inspectConstraints} from '../constraints';
import {features,terms} from '../features';
import {extraOrigins,fromOrigin,denseRank,compareDenseRank} from './geometry';
import {contact,department} from './contact';
import type {Candidate,Placement,PlanningInput} from '../types';

export interface DecisionRequest {input:PlanningInput;algorithm:'cluster-layer'}
export const CLUSTER_POLICY_VERSION='cluster-packing/1';
/** Floor first and exact new buried void first for all three policies.
 * Only the tie-breaking objective changes. Deliberately dispersed is an artificial
 * negative control; it still obeys every shared physical constraint.
 */
export function clusterRank(box:Placement,input:PlanningInput,policy:'cluster-layer'|'cluster-floor'|'dispersed'){
 const dense=denseRank(box,input);let same=0,zone=0,total=0;
 for(const other of input.placements){const c=contact(box,other);total+=c.area;if(box.typeId===other.typeId)same+=c.area;if(department(box.typeId)===department(other.typeId))zone+=c.area;}
 const norm=2*(box.size.w*box.size.d+box.size.w*box.size.h+box.size.d*box.size.h);
 const purity=same/norm,zonePurity=zone/norm;
 // cluster-floor uses 250mm bands; cluster-layer compares all valid upper heights.
 const layer=policy==='cluster-layer'?0:Math.floor(box.position.z/250);
 return [box.position.z<1e-5?0:1,dense[1],layer,policy==='dispersed'?purity:-purity,
  policy==='dispersed'?zonePurity:-zonePurity,dense[0],dense[2],-total,...dense.slice(3)];
}
export function searchCluster(request:DecisionRequest,base:Candidate[],deadline:number,publish:(candidate:Candidate)=>void,allow:(candidate:Candidate)=>boolean=()=>true){
 const input=request.input,seen=new Set<string>();let best:Candidate|null=null,rank:number[]|null=null,checks=0;
 const key=(p:Placement)=>[p.position.x,p.position.y,p.position.z,p.size.w,p.size.d,p.size.h].join(':');
 const consider=(candidate:Candidate)=>{const r=clusterRank(candidate.placement,input,request.algorithm);if(allow(candidate)&&performance.now()<deadline&&(!rank||compareDenseRank(r,rank)<0)){best=candidate;rank=r;publish(candidate);}};
 for(const c of base)if(c.valid){seen.add(key(c.placement));consider(c);}
 const expanded={...input,settings:{...input.settings,maxCandidates:128}};
 const origins=[...candidateOrigins(expanded,false).budget,...candidateOrigins(expanded,true).budget,...extraOrigins(input,deadline).raw];
 for(const raw of origins){
  if(performance.now()>=deadline)break;
  const proposal=fromOrigin(raw,input),k=key(proposal);if(seen.has(k))continue;seen.add(k);
  if(!geometricFeasible(raw,input.placements,input.pallet,input.constraints))continue;
  const check=inspectConstraints(proposal,input.current,input.placements,input.pallet,input.constraints);checks++;if(check.reasons.length)continue;
  const r=clusterRank(check.placement,input,request.algorithm);if(rank&&compareDenseRank(r,rank)>=0)continue;
  const f=features(check.stack,input.pallet,check.path.seconds,{...input,settings:{...input.settings,inventoryMode:'none'}});
  consider({id:`cluster-${k}`,placement:check.placement,valid:true,reasons:[],path:check.path,features:f,terms:terms(f,input.pallet,input.settings.weights,input.constraints.stability),score:0,fastScore:0,future:null});
 }
 return {candidate:best as Candidate|null,diagnostics:{policy:CLUSTER_POLICY_VERSION,mode:request.algorithm,fullConstraintChecks:checks,origins:seen.size,rank:rank??[],stop:performance.now()>=deadline?'deadline':'finite_pool_exhausted'}};
}
