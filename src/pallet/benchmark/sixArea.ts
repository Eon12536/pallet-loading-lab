import { activeAlgorithmRegistry } from './registry';
import type { BenchmarkConfig, CaseId } from './model';

export const REQUIRED_SIX_AREA_CASES:CaseId[]=['random','randomExceptions'];
/** Mandatory measurement profile; it changes test conditions, never score values. */
export function prepareSixArea(input:BenchmarkConfig):BenchmarkConfig {
 const config=structuredClone(input),active=new Set(activeAlgorithmRegistry().map(a=>a.id));
 config.algorithms=config.algorithms.filter(id=>active.has(id));
 config.cases=[...new Set([...REQUIRED_SIX_AREA_CASES,...config.cases])];
 config.scenario.constraints.robotMode='gripper';
 config.sixArea=true;config.continueAfterFailure=true;
 return config;
}
