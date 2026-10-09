import {threeConfig,THREE_IDS,THREE_NAMES} from './threeStudy';
import type {ThreeProfile} from './threeStudy';
import type {BenchmarkConfig,TrialRow} from './model';
export const SIMPLE_SCHEMA='ALPS-simple-pallet/1';
export {THREE_IDS,THREE_NAMES};
export function simpleConfig(profile:ThreeProfile='wide',count=120,seed=42,height=2200,repeats=3):BenchmarkConfig{
 const c=threeConfig(profile,count,seed,height,repeats);
 c.scenario.id='simple-pallet';c.scenario.name='단일 팔레트 비교';
 c.scenario.pallet.width=1200;c.scenario.pallet.depth=1000;
 c.decisionMs=10000;c.trialMs=180000;
 return c;
}
export function simpleReport(rows:TrialRow[],config:BenchmarkConfig){return {schema:SIMPLE_SCHEMA,createdAt:new Date().toISOString(),config,rows,verification:'동일 입고·정적 지지·하중·TCP 경로 근사. 박스 강도 120kg은 합성 가정값. 실제 관절 IK·진공·동적 붕괴 미검증. 자동 팔레트 반출 없음.'};}
