# 산업용 고정 패턴 기준선과 ALPS 비교

알고리즘 이름: **Conventional Pattern-Based Palletizing (HRPal-style Baseline)**.
기존 등록 ID `hrpal-inferred`는 유지하고 버전은 `conventional-pattern/2`로 구분한다. 이전 반복 격자 구현도 `hrpal-grid-v1`로 보존했다. 기존 Greedy, Rollout, Future-Aware Hybrid 등은 수정하지 않았다.

공식 출처: [HD현대로보틱스 HRPal 설명](https://www.hd-hyundairobotics.com/biz/product/support/287). 공개 자료가 설명하는 것은 패턴·Job 생성 및 위치·순서·방향 조정 기능이다. 아래 격자 생성·그룹화·탐색 순서는 이 프로젝트의 설계 가정이며 비공개 HRPal 알고리즘의 복제가 아니다. 본 실험으로 실제 HRPal보다 우수하다고 주장할 수 없다.

## 기존 구조와 통합

- React 19 / TypeScript / Vite 7, Three.js 3D 렌더링. 별도 Rapier 강체 검증이 있지만 이번 비교에는 실행하지 않았다.
- `Observation`은 현재 도착 박스, `Placement`는 확정 최소 모서리 좌표와 회전·접촉·하중, `PlanningInput → Analysis`는 공통 계획 인터페이스다. x/y 바닥, z 위쪽, mm·kg·s, 계산시간 ms.
- 레지스트리와 Benchmark Worker가 동일한 어댑터를 사용한다. `inspectConstraints`와 `auditProposal`, 확정 단계 `advance`, 최종 `evaluatePattern`을 재사용한다. 후보 점수로 안전 위반을 상쇄하지 않는다.
- 신규 후보는 기존 `PalletScene`에서 공통 경로를 따라 재생한다. 연속 입고·확장 컨베이어·중앙 오케스트레이션 엔진은 변경하지 않았다.

## 패턴 작동 원리와 기본값

`settings.conventionalPattern`: `column`(기본), `interlocking`, `brick`.

1. 팔레트 바닥 및 관측된 기존 박스의 상면 높이를 사용한다.
2. 같은 규격을 치수 키로 그룹화하고, 팔레트 격자와 관측된 그룹별 상면에 지역 격자를 만든다. 혼합 규격의 자유 공간 최적화로 전환하지 않는다.
3. Column은 반복 격자, Interlocking은 층별 0°/90° 방향 우선 교대, Brick은 행·층에 따른 반 폭 오프셋이다. 경계를 넘는 반 박스를 생성하거나 크기를 줄이지 않는다. 교차 우선 자세가 불가능하면 다른 허용 수평 자세를 검사한다.
4. 낮은 층, 큰 받침 영역, 층당 수량이 큰 허용 회전, 행별 왕복 순서로 검토한다. 이 기준선은 큰·무거운 박스도 가능한 낮은 층을 먼저 검사한다. 순차 입고에서는 미입고 물품을 선행 배치하거나 순서를 재정렬하지 않는다. 무거운 박스가 늦게 오면 공통 하중·중량 규칙에 따라 실패할 수 있다.
5. 경계·높이·회전·관통·지지·무게중심·누적 하중·설정된 그리퍼/TCP 경로를 검사하고 첫 유효 슬롯을 선택한다. 실패 원인은 패턴 부적합, 빈 슬롯 없음, 또는 공통 제약별로 반환한다.

수평 0°/90°만 지원하며 옆면 세우기, 임의 각도, 최적 패턴 설계는 이 기준선의 지원 범위가 아니다. 후보 상한은 기존 `maxCandidates`, 격자 열거 상한은 그 32배다. 비교 입력은 후보 48개, 1000×800×1400 mm, 로봇 1대·팔레트 1개, 버퍼 없음, 가반하중 35 kg(그리퍼 포함)을 사용했다. 모두 합성 가정이며 실제 현대 기종 사양이 아니다.

## 공정한 실측 비교

전체 등록 온라인 알고리즘 18개 × 동일 규격 12개 / 혼합 규격 18개 × 시드 42~46: **180회**. 각 짝은 동일 입력 fingerprint·박스 ID 순서를 확인했다. 온라인 입력에서 `available` 전체 재고를 제거하므로 실제 미래 순서는 계획기에 전달되지 않는다. 각 알고리즘은 독립 상태로 실행하고, 공통 평가와 탐색 상한을 적용한다. 원시 JSON에는 설정·버전·시드·단계별 좌표·경로·지지·계산시간을 저장한다.

| 혼합 규격 5개 시드 평균 | 고정 패턴 Column | 제약 기반 Greedy | Future-Aware Hybrid |
|---|---:|---:|---:|
| 적재 수 / 18개 | 3.2 | 12.6 | 11.6 |
| 수량 완료율 | 17.78% | 70.00% | 64.44% |
| 정격 부피 활용률 | 5.88% | 20.66% | 19.00% |
| trial별 최소 지지율 평균, 적재가 있는 실행만 | 100% | 97.76% | 99.10% |
| 평균 의사결정 시간, trial 평균 | 7.78 ms | 121.61 ms | 258.97 ms |
| trial별 P95 시간 평균 | 11.00 ms | 255.83 ms | 633.08 ms |

혼합 박스의 적재 성과에서는 Greedy를 우선 후보, Future-Aware Hybrid를 비교 후보로 선정했다. 계산 비용과 최소 지지율은 고정 패턴이 유리한 항목도 있다. 합성 두 규격의 균등 점수는 각각 66.22 / 87.69 / 85.65점이다. 이 점수는 50% 완료율 + 25% 입력 부피 적재율 + 15% 최소 지지율 + 10% 경로 추정 작업효율이며, 물리적 안전 인증 점수가 아니다. 계산시간은 별도로 표시한다. 5개 시드의 넓은 변동 범위 때문에 보편적인 우월성이나 통계적 유의성을 주장하지 않는다.

동일 규격 12개는 세 방식 모두 100% 완료, 부피 활용률 16.07%, 지지율 100%다. 이 조건에서는 고정 패턴이 평균 4.64 ms로 Greedy 24.97 ms / Hybrid 78.20 ms보다 빠르다.

추가로 모든 방식의 허용 자세를 수평 0°/90°로 통일한 혼합 3개 시드 비교에서는 평균 적재 수가 고정 패턴 4.67, Greedy 6.00, Hybrid 5.67개다. 주 실험의 성과 차이에는 다른 알고리즘이 활용하는 옆면 회전도 영향을 준다. 이를 숨기지 않고 별도 민감도 실험으로 구분했다.

48개 동일 규격 다층 시연: Column 48개 / 540 mm, Interlocking 48개 / 720 mm, Brick 32개 / 720 mm. 세 방식의 확정 배치는 공통 제약 위반 0건이다. Brick이 항상 더 효율적이지 않으며, 실패 시 안전 조건을 낮추지 않았다. 3가지 패턴 혼합 5개 시드 + 다층 1회씩, 회전 통일 9회: **27회 추가 실험**.

원시 자료: [전체 180회 JSON](single-pallet-benchmark.json), [CSV](single-pallet-benchmark.csv), [순위표 CSV](single-pallet-ranking.csv), [패턴·회전 민감도 JSON](conventional-pattern-comparison.json).

## 외부 HRPal 생성 패턴 연결 지점

`patternImport.ts`는 **중립 교환 형식**을 제공한다. HRPal의 비공개 네이티브 파일 파서가 아니다. 실제 내보내기 형식을 확인한 뒤 별도 변환기를 연결한다.

```json
{"version":1,"units":"mm","source":"사용자가 변환한 HRPal 패턴","entries":[{"boxId":"A-01","position":{"x":0,"y":0,"z":0},"size":{"w":250,"d":200,"h":180},"orientation":0}]}
```

`importExternalPattern(unknown)`은 mm/cm를 mm로 변환하고 유한성·양수 치수·중복 ID·허용 방향 형식을 검사한다. `planExternalPattern(input, document)`는 현재 도착 ID의 슬롯만 선택하고, 선행 항목의 확정 여부·관측 치수와 모든 공통 제약을 다시 검사한다. 문서를 안다는 이유로 미래 박스를 먼저 배치하지 않는다. UI 파일 업로드 및 HRPal 실제 포맷 변환은 후속 연결 범위다.

## 실행·검증·한계

앱 실행: `npm ci`, `npm run dev`. **현대·논문 비교** 탭에서 저장된 180회 결과를 보고 알고리즘·시드·규격을 선택해 재생한다. 패턴 방식은 다음 전체 비교 실행에 적용되며, 현재 표시된 결과의 패턴을 별도로 표시한다. **알고리즘 평가 / Benchmark**에도 신규 기준선이 등록되어 있다.

```text
npx vitest run tests/pallet-conventional-pattern.test.ts
npx vitest run tests/pallet-single-study.test.ts
npx vitest run tests/pallet-pattern-comparison.test.ts
npx vitest run tests/pallet-single-study-report.test.ts
npm run build
```

핵심 패턴·다층·미입고 차단·하중·공중 지지·외부 패턴 8개 테스트 및 공통 평가/하드 제약/레이더/단일 팔레트 회귀를 포함한 63개 테스트가 통과했다. 전체 비교 3개 검증과 추가 비교 1개도 통과했다. 실물 파지·진공 밀봉·관절 IK·전체 로봇 링크 충돌·이송 중 동적 붕괴는 미검증이다. 계산시간은 이 PC의 Node 측정이며 브라우저/엣지 장비에서의 시간을 보장하지 않는다. 로봇 시간과 처리량은 기존 속도·경로 모델의 추정값이다.

추가·변경 파일: `benchmark/hrpal.ts`, `hrpalGridV1.ts`, `patternImport.ts`, `registry.ts`, `SinglePalletStudy.tsx`, `singleStudy.ts`, `singleStudy.css`, `BenchmarkLab.tsx`, `types.ts`, `PalletLab.tsx`, `PalletScene.tsx`, `relay/dashboardView.ts`, 위 테스트 4개, 비교 JSON/CSV 및 이 문서. 기존 화면을 유지하며 새 비교 탭/패턴 설정과 재생에 필요한 최소 인터페이스만 추가했다.
