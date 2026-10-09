import { it,expect } from 'vitest';
import { ArrivalEnvironment,advance } from '../src/pallet/environment';
import { emptyFrame } from '../src/pallet/types';
import { singleStudyConfig } from '../src/pallet/benchmark/singleStudy';
import { HRPAL_NAME,patternSlots,patternPlacement,inspectPatternPlacements,planHrpalInferred } from '../src/pallet/benchmark/hrpal';
import { importExternalPattern,planExternalPattern } from '../src/pallet/benchmark/patternImport';
import { getAlgorithm } from '../src/pallet/benchmark/registry';
import { runTrial } from '../src/pallet/benchmark/runner';
import type { LayerPattern } from '../src/pallet/benchmark/hrpal';
function fixture(){
 const c=singleStudyConfig(1),s=c.scenario;s.constraints.horizontalGap=0;s.constraints.robotMode='ideal';
 s.constraints.heavyRule='off';s.constraints.standingHeight={enabled:false,maxRiseMm:240};
 s.pallet={width:1000,depth:800,maxHeight:1400};
 s.types=[{id:'A',name:'A',size:{w:250,d:200,h:180},quantity:48,weight:2,orientations:[0,90],color:'#abc',material:'plastic',maxLoadKg:100}];
 s.arrival={seed:42,pattern:'ordered'};c.settings.maxCandidates=128;
 const env=new ArrivalEnvironment(s);return {c,env,input:env.input(emptyFrame(),'greedy',c.settings,'patterns')!};
}
it('registers the requested baseline name without replacing existing planners',()=>{
 expect(getAlgorithm('hrpal-inferred').name).toBe(HRPAL_NAME);expect(getAlgorithm('greedy').scope).toBe('online');
});
it('generates column, alternating interlocking, and offset brick fixed layers',()=>{
 const {input}=fixture(),first=planHrpalInferred(input),p=first.candidates.find(c=>c.id===first.selectedId)!.placement;
 input.placements=[p];const c=patternSlots(input,'column').slots,b=patternSlots(input,'brick').slots,i=patternSlots(input,'interlocking').slots;
 expect(c.find(s=>s.z===180)?.orientation).toBe(0);expect(i.find(s=>s.z===180)?.orientation).toBe(90);
 expect(b.some(s=>s.x===125&&s.y===200)).toBe(true);
 for(const slots of [c,b,i])expect(slots.every(s=>s.x>=0&&s.y>=0)).toBe(true);
});
it('fills multiple column layers through the common commit validator, even after the bottom grid fills',()=>{
 const {env,c}=fixture();let frame=emptyFrame();
 for(let n=0;n<48;n++){const input=env.input(frame,'greedy',c.settings,'layers')!,r=planHrpalInferred(input);expect(r.selectedId).not.toBeNull();frame=advance(frame,input,r);expect(frame.blocked).toBe(false);}
 expect(frame.placements).toHaveLength(48);expect(Math.max(...frame.placements.map(p=>p.position.z))).toBeGreaterThan(0);
});
it('groups mixed observed top faces, keeps fixed boxes, and never selects unavailable future stock',()=>{
 const {input}=fixture(),before=structuredClone(input.placements);
 input.remaining={Future:500};input.types.push({...input.types[0],id:'Future',weight:30,size:{w:900,d:700,h:200}});
 for(const pattern of ['column','interlocking','brick'] as LayerPattern[]){const r=planHrpalInferred(input,pattern);expect(r.candidates.every(c=>c.placement.id===input.current.id)).toBe(true);expect(r.selectedBoxId).toBeUndefined();}
 expect(input.placements).toEqual(before);
 const p=patternPlacement(input,{x:300,y:200,z:0},0);input.placements=[p];expect(patternSlots(input,'column').groups).toBe(1);
 expect(patternSlots(input,'column').slots.some(s=>s.x===300&&s.y===200&&s.z===180)).toBe(true);
});
it('rejects unsafe height, overlap, floating support, and cumulative lower load using shared checks',()=>{
 const {input}=fixture();const check=(z:number)=>inspectPatternPlacements(input,[patternPlacement(input,{x:0,y:0,z},0)],1,[]);
 expect(check(1500).selectedId).toBeNull();expect(check(20).selectedId).toBeNull();
 input.placements=[{...patternPlacement(input,{x:0,y:0,z:0},0),maxLoadKg:1}];input.current={...input.current,id:'B'};
 expect(check(0).selectedId).toBeNull();const overloaded=check(180);expect(overloaded.selectedId).toBeNull();expect(Object.keys(overloaded.rejections).some(r=>/하중/.test(r))).toBe(true);
});
it('reports unsupported posture explicitly instead of using a hidden free-placement fallback',()=>{
 const {input}=fixture();input.current.orientationAllowed=['hwd'];const r=planHrpalInferred(input);
 expect(r.selectedId).toBeNull();expect(Object.keys(r.rejections)).toHaveLength(1);expect(r.candidates).toHaveLength(0);
});
it('normalizes external units, validates identifiers, preserves actual dimensions and sequential execution',()=>{
 const {input}=fixture();const raw={version:1,units:'cm',source:'HRPal export converted by user',entries:[{boxId:input.current.id,position:{x:0,y:0,z:0},size:{w:25,d:20,h:18},orientation:0}]};
 const doc=importExternalPattern(raw);expect(doc.entries[0].size.w).toBe(250);expect(planExternalPattern(input,doc).selectedId).not.toBeNull();
 expect(()=>importExternalPattern({...raw,entries:[raw.entries[0],raw.entries[0]]})).toThrow();
 doc.entries[0].size.w=1;expect(planExternalPattern(input,doc).selectedId).toBeNull();doc.entries[0].size.w=250;
 doc.entries.unshift({...doc.entries[0],boxId:'not-arrived'});expect(planExternalPattern(input,doc).selectedId).toBeNull();
});
it('shares identical arrival fingerprints and independently records utilization, timing, support and path estimates',async()=>{
 const {c}=fixture();c.scenario.constraints.robotMode='gripper';c.scenario.types[0].quantity=12;
 const spec={caseId:'random' as const,seed:42,episode:0};const a=await runTrial(c,{...spec,algorithm:'hrpal-inferred'}),b=await runTrial(c,{...spec,algorithm:'greedy'});
 expect(a.fingerprint).toBe(b.fingerprint);expect(a.arrivalIds).toEqual(b.arrivalIds);expect(a.values.count).toBe(12);expect(a.proposalViolations).toEqual({});
 for(const key of ['utilization','completion','supportMin','meanMs','workSeconds','throughput'])expect(a.values[key]).not.toBeNull();
 expect(a.hardConstraints?.robotCollision.scope).toBeTruthy();expect(a.robot).toBe('proxy');
});
