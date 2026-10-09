import {CLUSTER_SETTINGS} from './preset';
import {searchCluster,clusterRank} from './packing';
import {compareDenseRank} from './geometry';
import {candidateSet} from '../candidates';
import {scanned} from '../relay/intake';
import {branchReady,branchAvailable,mainY,BRANCH,usesBranches} from '../relay/branchedConveyor';
import {atRollerPickup} from '../relay/rollerQueue';
import {movingPickup,inPickWindow} from '../relay/streamGeometry';
import {cellPose,toLocal} from '../relay/layout';
import {CONVEYOR} from '../relay/conveyor';
import {inspectMotion} from '../relay/motion';
import type {Scenario,PlanningInput,Candidate} from '../types';
import type {RelayWorld} from '../relay/types';
import type {FlowDecision,FlowProposal} from '../relay/streamPlanner';

// No actual future sequence or arrival RNG enters a placement request.
export function clusterInput(s:Scenario,w:RelayWorld,robot:number,box:RelayWorld['boxes'][number]):PlanningInput{
 const remaining=Object.fromEntries(s.types.map(t=>[t.id,t.quantity]));
 for(const b of w.boxes)if(b.status==='placed'||b.status==='reserved'||b.status==='outfeed'||b.flow?.transport?.robot!==undefined||b.observation.id===box.observation.id)remaining[b.observation.typeId]=Math.max(0,remaining[b.observation.typeId]-1);
 const pt=toLocal({x:cellPose(robot,s.pallet).x,y:mainY+BRANCH.length,z:CONVEYOR.deck},robot,s.pallet);
 const pickup=usesBranches(s.pallet)?{x:pt.x-box.observation.size.w/2,y:pt.y-box.observation.size.d/2,z:pt.z}:movingPickup(box,w.time,w.stream!.speed,s.pallet,robot);
 return {runId:w.runId,stepId:w.revision,pallet:s.pallet,types:s.types,constraints:s.constraints,placements:w.cells[robot].placements,current:{...box.observation,pickupPosition:pickup},remaining,settings:CLUSTER_SETTINGS,algorithm:'bl'};
}
export function planClusterStream(s:Scenario,w:RelayWorld,busy:number[]=[],publish?:(d:FlowDecision)=>void):FlowDecision{
 const started=performance.now(),deadline=started+9000,offers:FlowProposal[]=[],tested=new Set<number>();let checks=0;
 const known=w.boxes.filter(b=>b.status==='belt'&&b.observation.status==='normal'&&scanned(b,w.time,s)).sort((a,b)=>a.flow!.enteredAt-b.flow!.enteredAt);
 const ready=known.filter(b=>usesBranches(s.pallet)?branchReady(b,b.flow!.transport?.robot??-1):atRollerPickup(b,s.pallet));
 // Already routed parcels are transport reservations, not a reorderable planning buffer.
 const current=known.find(b=>usesBranches(s.pallet)?b.flow?.transport?.kind==='main'&&b.flow.transport.robot===undefined:atRollerPickup(b,s.pallet));
 const tasks=[...(usesBranches(s.pallet)?ready:ready.slice(0,1)).filter(b=>!busy.includes(b.flow?.transport?.robot??0)),...(current&&!ready.includes(current)?[current]:[])];
 const rejectIds:string[]=[],ranks:{boxId:string;robot:number;rank:number[]}[]=[];
 const decision=():FlowDecision=>({runId:w.runId,proposals:[...offers],commands:[...offers],cellVersions:w.cells.map(c=>c.version),milliseconds:performance.now()-started,checks,dispatch:{mode:'central',offered:tested.size,commands:offers.length,visited:checks,capped:performance.now()>=deadline,assignments:offers.map(p=>({robot:p.robot,pallet:0,boxId:p.boxId,cellVersion:p.cellVersion}))},cluster:{currentId:current?.observation.id,rankings:[...ranks],rejectIds:[...rejectIds],searchBudgetMs:9000,cycleBudgetMs:10000}});
 for(const b of tasks){
  let best:FlowProposal|undefined,bestRank:number[]|undefined;
  const routed=b.flow?.transport?.kind==='branch';
  const eligible=w.cells.map((_,i)=>i).filter(i=>!busy.includes(i)&&!offers.some(o=>o.robot===i)&&(!routed||b.flow!.transport!.robot===i)&&(!usesBranches(s.pallet)||routed||branchAvailable(w,i,b)&&inPickWindow(b,w.time,w.stream!.speed,s.pallet,i)));
  for(const robot of eligible){
   if(performance.now()>=deadline)break;tested.add(robot);const input=clusterInput(s,w,robot,b);
   const allow=(c:Candidate)=>!inspectMotion(s,w,{runId:w.runId,revision:w.revision,cellVersion:w.cells[robot].version,robot,pallet:0,kind:'place',boxId:b.observation.id,from:robot,reason:'',candidate:c,path:c.path,seconds:c.path.seconds,initialCenter:{x:0,y:0,z:0}}).length;
   const base=candidateSet({...input,settings:{...CLUSTER_SETTINGS,inventoryMode:'none'}},false).candidates;
   const update=(c:Candidate)=>{if(!allow(c))return;const rank=clusterRank(c.placement,input,'cluster-layer');if(!bestRank||compareDenseRank(rank,bestRank)<0){bestRank=rank;best={robot,pallet:0,boxId:b.observation.id,cellVersion:w.cells[robot].version,candidates:[c],reason:`ALPS 군집 · 중앙 R${robot+1}/P1 선택 · 바닥 → 새 공극 → 같은 SKU 접촉 → 지지·하중·경로 통과`,blocked:0,tested:eligible.length};}};
   const result=searchCluster({input,algorithm:'cluster-layer'},base,deadline,update,allow);checks+=result.diagnostics.fullConstraintChecks;
   if(result.candidate){ranks.push({boxId:b.observation.id,robot,rank:clusterRank(result.candidate.placement,input,'cluster-layer')});update(result.candidate);}
   // Publish only a whole valid decision; late messages are discarded by the supervisor.
   if(best){const previous=offers.length;offers.push(best);publish?.(decision());offers.length=previous;}
  }
  if(best)offers.push(best);
  else if(eligible.length&&!busy.length&&offers.length===0&&performance.now()<deadline)rejectIds.push(b.observation.id);
 }
 return decision();
}
