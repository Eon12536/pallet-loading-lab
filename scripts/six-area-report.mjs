import { readFileSync,writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
const path='docs/benchmark-six-area.json',r=JSON.parse(readFileSync(path,'utf8'));
r.environment.cpu=cpus()[0]?.model??'미확인';r.environment.logicalThreads=cpus().length;
const areaKeys=['efficiency','stability','time','robustness','robot','exception'];
if(r.summary.some(a=>areaKeys.some(k=>!Number.isFinite(a.scores[k]))))throw Error('측정되지 않은 축이 있습니다.');
const exceptions=r.rows.filter(t=>t.caseId==='randomExceptions');
if(exceptions.some(t=>t.exceptions.length!==3))throw Error('예외 3종 도달을 확인할 수 없습니다.');
const violations=r.rows.reduce((n,t)=>n+Object.values(t.proposalViolations).reduce((s,v)=>s+v,0),0);
const f=n=>n==null?'미검증':n.toFixed(2);
const table=r.summary.map(a=>`| ${a.algorithm} | ${f(a.score)} | ${f(a.metrics.count.mean)} | ${f(a.scores.robot)} | ${f(a.scores.exception)} | ${a.coverage}% | ${a.failed} |`).join('\n');
writeFileSync(path,JSON.stringify(r,null,2));writeFileSync('public/benchmark-six-area.json',JSON.stringify(r));
writeFileSync('docs/BENCHMARK-SIX-AREA.md',`# 6영역 벤치마크 측정

[공개 벤치마크](https://pallet-loading-lab.eon3602.chatgpt.site/?palletView=benchmark&v=40#pallet)

기존의 누락 축은 로봇 기하 실행과 예외 대응이었다. 이상적 로봇 모드와 무사건 시나리오에서는 두 값이 null이므로 부분 도형을 표시했다. 숫자를 채우는 대신 필수 측정 조건을 추가했다.

## 시험 조건

- 활성 온라인 알고리즘 ${r.config.algorithms.length}개, 무작위 순서와 무작위 예외 2조건, 각 ${r.config.repeats}시드: 총 ${r.rows.length}회. 시드 ${r.config.seed}~${r.config.seed+r.config.repeats-1}.
- 팔레트 1000 × 800 × 1400 mm, 혼합 박스 18개. 같은 박스 목록·입고 순서·물성·공통 검사·판단시간 예산을 적용한다. 각 실행은 독립 상태이다.
- 누락·파손·규격 오인식 각 1회. 종류와 발생 위치는 재현 가능한 난수로 결정하며 첫 입고에도 1사건이 발생한다. ${exceptions.length}회 예외 시험 모두 3사건에 도달했다.
- 무작위 실제 미래 순서와 사건 위치는 평가기 내부 정보이며 온라인 계획기에는 전달하지 않는다.
- 그리퍼·TCP 경로 근사 필수. 판단 ${r.config.decisionMs} ms, trial ${r.config.trialMs} ms, 후보 상한 ${r.config.settings.maxCandidates}, 후처리 잔량 검사 예산 ${r.config.probeLimit}.
- 실행 환경: ${r.environment.runtime}, ${r.environment.platform}/${r.environment.architecture}, ${r.environment.cpu}. 같은 Node 프로세스에서 알고리즘별 워밍업 1회 후 통계에서 제외, 시드별 실행 순서 회전. 브라우저 Worker 측정과는 별도 기록이다. 공유 호스트의 시간 측정이며 실기 속도 벤치마크가 아니다.

## 실제 결과

${r.summary.length}개 모두 6개 영역에 유한한 측정 점수와 100% 영역 커버리지가 있다. 제약 위반 제안 ${violations}건. 영역 커버리지는 실물 안전 검증 완료율이 아니다.

| 알고리즘 | 모델 종합 | 평균 적재 개수 | 로봇 기하 | 예외 대응 | 영역 커버리지 | 실패 trial |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${table}

알고리즘의 순위는 합성 조건과 사용자 가중치에 따른 잠정 순위이다. 개별 미적재는 완료율에 반영한다. 안전 위반·시간 초과·실행 오류·적재 0개는 종합점수 및 순위에서 제외한다.

## 구현과 검증 범위

- sixArea.ts: 무작위 순서·예외와 그리퍼 검사 강제. UI에서 필수 조건은 해제할 수 없다. 기본 새 실행 반복은 100회이고 사전 측정은 ${r.config.repeats}회/조건이다.
- scenarios.ts: 독립 난수로 사건 생성, 실제 대상 박스 치수에서 규격 오인식 생성. 4개 미만 입력은 명시적으로 거부한다.
- runner.ts: 해당 평가 모드에서 정상적인 배치 불가만 미적재로 기록하고 다음 입고를 검사한다. 생산 시뮬레이션 계획기나 안전 제약은 변경하지 않았다. 제약 위반은 계속 중단·거부한다.
- registry.ts: 현대 추정 2기준선을 활성 비교·새 내보내기에서 제외한다. 기존 파일과 어댑터는 과거 재현을 위해 보존한다.
- BenchmarkLab.tsx: 실제 사전 측정 로드, 다음 실행도 동일 필수 프로필 적용, 로컬 Node와 브라우저 Worker 환경 구분. 점수·순위·재생·CSV/JSON·가중치 기능 유지.
- Radar.tsx: 기존의 6축 렌더링 사용. 측정 값만 연결하며 null과 0을 구분한다. 예외 실패나 실제 0점은 그대로 표시한다. 어떤 입력·오류에서도 가짜 육각형을 보장하지 않는다.

로봇 영역은 그리퍼 체적·TCP 접근 경로와 정상 박스 전체 완료의 기하 근사이다. 실제 관절 IK, 전체 링크 충돌, 진공 밀봉, 파지 성공, 판지 동적 붕괴는 미검증이다. 누락·파손 격리·규격 재관측은 합성 이벤트 모델의 대응이며 실물 센서 성능이 아니다.

관련 회귀 및 신규 테스트: pallet-six-area, pallet-evaluation, pallet-evaluation-v2, pallet-benchmark-radar, pallet-conventional-pattern, pallet-single-dashboard, 단일 팔레트 설정·과거 패턴 재생. 반복 측정 재실행: node node_modules/vitest/vitest.mjs run tests/pallet-six-area-benchmark.test.ts. Markdown 재생성: node scripts/six-area-report.mjs.

[원시 JSON](benchmark-six-area.json) · [원시 CSV](benchmark-six-area.csv)
`);
console.log(JSON.stringify({trials:r.rows.length,algorithms:r.summary.length,exceptions:exceptions.length,violations,elapsedSeconds:r.elapsedMs/1000}));
