import { it,expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prepareSixArea } from '../src/pallet/benchmark/sixArea';
import { singleStudyConfig } from '../src/pallet/benchmark/singleStudy';
import { activeAlgorithmRegistry,getAlgorithm } from '../src/pallet/benchmark/registry';
import { buildCase,validateBenchmark } from '../src/pallet/benchmark/scenarios';
import { runTrial } from '../src/pallet/benchmark/runner';
import { aggregate } from '../src/pallet/benchmark/scoring';
import { Radar } from '../src/pallet/benchmark/Radar';
import { scenario } from '../src/pallet/scenarios';
import type { PlanningInput } from '../src/pallet/types';

it('requires actual measurements without mutating the input or erasing historical adapters',()=>{
 const input=singleStudyConfig(2),before=structuredClone(input);input.algorithms.push('hrpal-inferred','hrpal-grid-v1');
 const config=prepareSixArea(input);expect(config.cases).toEqual(expect.arrayContaining(['random','randomExceptions']));expect(config.scenario.constraints.robotMode).toBe('gripper');expect(config.continueAfterFailure).toBe(true);
 expect(activeAlgorithmRegistry().map(a=>a.id)).not.toContain('hrpal-inferred');expect(config.algorithms).not.toContain('hrpal-grid-v1');expect(getAlgorithm('hrpal-inferred')).toBeDefined();expect(input.scenario).toEqual(before.scenario);
 expect(()=>validateBenchmark(config)).not.toThrow();expect(()=>validateBenchmark({...config,continueAfterFailure:false})).toThrow();expect(()=>validateBenchmark({...config,cases:['random']})).toThrow();
});
it('injects all three exceptions at distinct reproducible positions, with an event at the first arrival',()=>{
 const base=singleStudyConfig().scenario,a=buildCase(base,'randomExceptions',42),b=buildCase(base,'randomExceptions',42),c=buildCase(base,'randomExceptions',43);
 expect(a).toEqual(b);expect(a.events).not.toEqual(c.events);expect(a.events.map(e=>e.kind).sort()).toEqual(['damaged','missing','resize']);expect(new Set(a.events.map(e=>e.step)).size).toBe(3);expect(a.events.some(e=>e.step===1)).toBe(true);expect(base.events).toEqual([]);
});
it('continues only ordinary infeasibility in benchmark mode, preserving the original stop behavior',async()=>{
 const c=singleStudyConfig(2);c.scenario=scenario('identical');c.scenario.types[0].quantity=4;c.scenario.types[0].maxLoadKg=100;c.algorithms=['random'];
 const adapter={...getAlgorithm('random'),plan:(i:PlanningInput)=>{const a=getAlgorithm('random').plan(i);if(i.stepId===0)a.selectedId=null;return a;}};
 const spec={algorithm:'random',caseId:'mixed' as const,seed:42,episode:0};
 const old=await runTrial(c,spec,{},adapter),next=await runTrial({...c,continueAfterFailure:true},spec,{},adapter);
 expect(old.trace).toHaveLength(1);expect(next.trace).toHaveLength(4);expect(next.trace![0].disposition).toBe('unplaced');expect(next.values.count).toBe(3);expect(next.values.unplaced).toBe(1);expect(next.proposalViolations).toEqual({});
});
it('does not continue or commit a constraint-violating proposal',async()=>{
 const c=prepareSixArea(singleStudyConfig(2)),spec={algorithm:'random',caseId:'random' as const,seed:42,episode:0};
 const bad={...getAlgorithm('random'),plan:(i:PlanningInput)=>{const a=getAlgorithm('random').plan(i),p=a.candidates.find(c=>c.id===a.selectedId);if(p)p.placement.position.x=-100;return a;}};
 const r=await runTrial(c,spec,{},bad);expect(r.outcome).toBe('constraint-rejected');expect(r.values.count).toBe(0);expect(r.trace).toHaveLength(1);expect(aggregate([r])[0].score).toBeNull();
});
it('measures six finite scores and six radar vertices while leaving IK and actual suction unverified',async()=>{
 const c=prepareSixArea(singleStudyConfig(2));c.algorithms=['random'];c.cases=['random','randomExceptions'];const rows=[];
 for(let episode=0;episode<2;episode++)for(const caseId of c.cases)rows.push(await runTrial(c,{algorithm:'random',caseId,seed:42+episode,episode}));
 const a=aggregate(rows)[0];expect(a.missing).toEqual([]);expect(a.coverage).toBe(100);expect(Object.values(a.scores).every(v=>v!==null&&Number.isFinite(v))).toBe(true);
 for(const r of rows){expect(r.values.ikSuccess).toBeNull();expect(r.values.graspSuccess).toBeNull();expect(r.proposalViolations).toEqual({});if(r.caseId==='randomExceptions')expect(r.exceptions).toHaveLength(3);}
 const html=renderToStaticMarkup(createElement(Radar,{data:[a]}));expect(html).toContain('6/6개 영역 측정');expect(html).not.toContain('bench-partial');
 const points=html.match(/class="bench-fill" points="([^"]+)"/)![1];expect(points.split(' ')).toHaveLength(6);
});
