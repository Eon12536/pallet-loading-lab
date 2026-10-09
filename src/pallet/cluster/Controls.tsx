import type {Scenario} from '../types';
export function ClusterControls({scenario,robots,onLoad,onRobots}:{scenario:Scenario;robots:number;onLoad:(skus:6|8,order:number)=>void;onRobots:(n:number)=>void}){
 const p=scenario.clusterPreset;
 return <section className="intake-readout" aria-label="ALPS 군집 고정 조건"><h4>ALPS 군집 · 고정 조건</h4>
 <label>재현 재고<select aria-label="ALPS 군집 SKU 조건" value={p?.skus??6} onChange={e=>onLoad(+e.target.value as 6|8,p?.order??0)}><option value="6">6 SKU · 각 5개 · 총 30개</option><option value="8">8 SKU · 4/3 분배 · 총 30개</option></select></label>
 <label>입고 순서 번호<select aria-label="ALPS 고정 입고 순서" value={p?.order??0} onChange={e=>onLoad(p?.skus??6,+e.target.value)}>{Array.from({length:100},(_,i)=><option key={i} value={i}>{i+1} / 100 · seed {(p?.skus===8?460100000:460000000)+i}</option>)}</select></label>
 <label>바닥 로봇 수<input aria-label="ALPS 군집 로봇 수" type="number" min={1} max={8} value={robots} onChange={e=>onRobots(+e.target.value)}/></label>
 {!p&&<button type="button" onClick={()=>onLoad(6,0)}>군집 고정 조건 적용</button>}
 <p>1200 × 1000 × 1200mm · 로봇당 팔레트 1개 · 전체 공급은 총 30개 · 임시 적재 버퍼 없음 · 자동 반출 없음</p>
 <p>지지 ≥85% · 하중 안전계수 1.2 · 무거운 것 우선 규칙 꺼짐 · 세운 상태 XY 0/90° · 파손/오인식/배치 오차 없음</p>
 <p>현재 박스 → 중앙 전체 팔레트 비교 → 로봇/서브 배정 → 선두 집기 → 적재. 실제 미래 입고 순서를 계획기에 전달하지 않습니다.</p>
 <details><summary>고정 규격 · 선택 규칙 · 검증 범위</summary><p>바닥 → 새 공극 → 같은 SKU 접촉 → 같은 부서 접촉 → 높이 등 17항목 사전식 최소화. 군집에 rollout을 추가하지 않습니다.</p><p>기본 후보48 · 확장 목록 각각128 + 추가 좌표 · planner seed91473 · 결정 전체 탐색 최대9초, cycle 목표10초. 실제 로봇 동작은650mm/s 경로 추정이며 실물10초 보장은 아닙니다.</p><table><thead><tr><th>품목</th><th>W×D×H mm</th><th>질량 kg</th><th>상부하중 입력 kg</th><th>수량</th></tr></thead><tbody>{scenario.clusterPreset&&scenario.types.map(t=><tr key={t.id}><td>{t.id} {t.name}</td><td>{t.size.w}×{t.size.d}×{t.size.h}</td><td>{t.weight}</td><td>{t.maxLoadKg} / 1.2</td><td>{t.quantity}</td></tr>)}</tbody></table><p>같은 부서: S1/S2, S3/S4, S5/S6, S7/S8. 실제 면 접촉만 보상. 강도는 합성 가정, TCP/그리퍼 경로는 기하 근사이며 전체 링크 IK·진공·운송 안정성은 미검증입니다.</p><p>제공 명세와 로컬 군집 소스를 통합한 확장판입니다. evaluation-v2 동결본이 없는 상태에서 기준 signature 동일 재현을 주장하지 않습니다. 여러 팔레트를 함께 선택하는 중앙 배차는 원래 단일 팔레트 시험과 별도입니다.</p></details>
 </section>;
}
