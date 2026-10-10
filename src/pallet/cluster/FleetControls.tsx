import type {Scenario} from '../types';
export function FleetControls({scenario,robots,quantity,damagePercent,onRobots,onQuantity,onDamage,onApply}:{scenario:Scenario;robots:number;quantity:number;damagePercent:number;onRobots:(n:number)=>void;onQuantity:(n:number)=>void;onDamage:(n:number)=>void;onApply:()=>void}){
 return <section className="intake-readout" aria-label="군집 다중 로봇 시연 조건">
  <h4>6 SKU · ALPS 군집</h4>
  <label>로봇 수<input aria-label="군집 시연 로봇 수" type="number" min={2} max={8} step={1} value={robots} onChange={e=>onRobots(+e.target.value)}/></label>
  <label>SKU당 공급 수량<input aria-label="군집 시연 SKU당 수량" type="number" min={5} max={80} step={1} value={quantity} onChange={e=>onQuantity(+e.target.value)}/></label>
  <label>이상 박스 발생률 · %<input aria-label="군집 시연 이상 박스 발생률" type="number" min={0} max={100} step={1} value={damagePercent} onChange={e=>onDamage(+e.target.value)}/></label>
  <p>입구 스캔 → 눌림 ≥8mm 검출 → 분기 전 측면 푸셔 → 불량 전용 팔레트. 모서리·윗면·옆면 눌림을 시드에 따라 생성합니다. 같은 시드·발생률이면 같은 박스가 불량으로 재현됩니다.</p>
  <p>전체 {quantity*6}개 · 로봇당 팔레트 1개 · 중앙 배차 · 무작위 입고<br/>벨트 315mm/s · 연속 공급 · 중앙 허브에서 병렬 분배 · 안전 간격 유지</p>
  <button onClick={onApply}>조건 적용 · 재실행</button>
  <p>팔레트 1200 × 1000mm<br/>높이 상한 <b>1200mm</b><br/>지지 ≥85% · 누적 하중 검사<br/>XY 0/90° · 합성 강도 / 안전계수 1.2</p>
  <p>입고 seed {scenario.arrival.seed}. 같은 SKU의 실제 면 접촉을 선호하는 17항목 사전식 군집 규칙을 사용합니다.</p>
  <details><summary>6 SKU 규격과 검증 범위</summary>{scenario.types.map(t=><p key={t.id}><b>{t.id} {t.name}</b><br/>{t.size.w} × {t.size.d} × {t.size.h}mm · {t.weight}kg<br/>상부 하중 입력 {t.maxLoadKg}kg / 1.2</p>)}<p>기존 30개 재현 조건에서 공급 수량과 벨트·입고 빈도를 확장한 시연입니다. 실제 미래 입고 순서는 계획기에 전달하지 않습니다. 제약을 만족하는 후보가 없으면 미적재로 기록합니다. 목표 높이를 위해 충돌·지지·하중 조건을 완화하지 않습니다.</p><p>그리퍼/TCP 경로는 기하 근사, 실제 전체 링크 운동학·진공·운송 안정성은 미검증입니다. 중앙서버 구조는 브라우저 Worker에서 실행합니다.</p></details>
 </section>;
}
