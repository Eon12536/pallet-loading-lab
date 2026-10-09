import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {singleStudyConfig} from '../src/pallet/benchmark/singleStudy';
import {getAlgorithm} from '../src/pallet/benchmark/registry';
import {runTrial} from '../src/pallet/benchmark/runner';
import type {TrialRow} from '../src/pallet/benchmark/model';
it('measures all three patterns and a matched upright-only sensitivity study',async()=>{
 const patterns:Record<string,TrialRow[]>={column:[],interlocking:[],brick:[]},upright:TrialRow[]=[];
 const c=singleStudyConfig(5);c.algorithms=['hrpal-inferred','greedy','future-hybrid'];
 for(const pattern of ['column','interlocking','brick'] as const){
  const p=structuredClone(c);p.settings.conventionalPattern=pattern;
  for(let e=0;e<5;e++)patterns[pattern].push(await runTrial(p,{algorithm:'hrpal-inferred',caseId:'random',seed:42+e,episode:e}));
  const s=structuredClone(p);s.scenario.constraints.horizontalGap=0;s.scenario.constraints.standingHeight={enabled:false,maxRiseMm:240};
  s.scenario.types=[{id:'A',name:'A',size:{w:250,d:200,h:180},quantity:48,weight:2,orientations:[0,90],color:'#abc',material:'plastic',maxLoadKg:100}];
  patterns[pattern].push(await runTrial(s,{algorithm:'hrpal-inferred',caseId:'random',seed:42,episode:5}));
 }
 const u=structuredClone(c);for(const t of u.scenario.types)t.orientations=[0,90];
 for(let e=0;e<3;e++)for(const algorithm of u.algorithms){
  const r=await runTrial(u,{algorithm,caseId:'random',seed:42+e,episode:e});upright.push(r);
  const peers=upright.filter(x=>x.seed===r.seed);expect(r.fingerprint).toBe(peers[0].fingerprint);expect(r.arrivalIds).toEqual(peers[0].arrivalIds);
 }
 for(const r of [...Object.values(patterns).flat(),...upright]){expect(r.finalReasons).toEqual([]);expect(r.proposalViolations).toEqual({});expect(['error','timeout','constraint-rejected']).not.toContain(r.outcome);}
 const mean=(rows:TrialRow[],k:string)=>{const v=rows.flatMap(r=>r.values[k]==null?[]:[r.values[k]!]);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
 const summarize=(rows:TrialRow[])=>Object.fromEntries(['count','completion','utilization','height','supportMin','meanMs','p95Ms','workSeconds','throughput'].map(k=>[k,mean(rows,k)]));
 const report={createdAt:new Date().toISOString(),scope:'Synthetic static geometry and gripper/TCP proxy, not actual HRPal or hardware',config:c,patterns:Object.fromEntries(Object.entries(patterns).map(([k,rows])=>[k,{mixed:summarize(rows.slice(0,5)),homogeneous48:summarize(rows.slice(5)),rows}])),uprightOnly:{config:u,summary:u.algorithms.map(id=>({algorithm:id,name:getAlgorithm(id).name,...summarize(upright.filter(r=>r.algorithm===id))})),rows:upright}};
 writeFileSync('docs/conventional-pattern-comparison.json',JSON.stringify(report,null,2));console.log(JSON.stringify({patterns:Object.fromEntries(Object.entries(report.patterns).map(([k,v])=>[k,{mixed:v.mixed,homogeneous48:v.homogeneous48}])),upright:report.uprightOnly.summary}));
},300000);
