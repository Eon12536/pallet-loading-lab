# ALPS 군집 고정 조건 · 중앙 다중 로봇 확장

확장성 탭에서 ALPS 군집 고정 조건 적용을 선택한다. URL `?palletView=relay&clusterSkus=6&clusterOrder=0&robotCount=4#pallet`은 6 SKU 첫 순서, 4대/4팔레트로 연다. SKU6/8, 순서번호1~100, 바닥 로봇1~8만 변경한다. 대수 변경은 변경 로봇 수 적용을 누른다. 실행/일시정지/같은 입력 초기화/다음 순서/JSON 내보내기를 지원한다. 자유 조건 모드는 보존된다.

## 고정 입력
1200×1000×1200mm, 총30개, 로봇당 팔레트1개, upright XY0/90°, paper, 마찰0.45. S1~S6은 사용자 명세 규격/질량/합성 상부하중이며 SKU6은 각5개, SKU8은 S1~S6각4개/S7,S8각3개. seed460000000+순서 또는460100000+순서. 남은 개별 상자 균등 추출은 기존 ArrivalEnvironment/rng를 재사용한다. 지지0.85, 접촉높이 허용오차0.5mm, 최소여유0.05, 누적하중 안전계수1.2, heavyRule off, slenderness score. 그리퍼180×160×160mm/8kg, 총가반38kg, margin5mm/lift180mm/speed650mm/s/pick0.7s/place0.45s/rotation90deg/s. 작업공간과 TCP 반경은 명세 값 그대로다. 불량/관측/배치 오차 이벤트 없음. 자동 팔레트 반출과 교체 없음.

## 정책 및 중앙 배차
cluster/geometry.ts, contact.ts, packing.ts는 로컬 ALPS 소스의 기하 도우미와 cluster-layer를 현재 엔진 인터페이스로 포팅한다. 17항목 사전식 최소화, epsilon1e-7, 실제 면 접촉 epsilon1e-5mm. 기본48, 확장 일반128+support128+추가origins이며 전체128 상한이 아니다. 군집 rollout 없음. cluster/dispatch.ts는 현재 스캔된 박스 하나를 전체 가용 팔레트 후보와 비교해 목적지 로봇/서브를 결정한다. 이미 배정된 서브 선두는 해당 팔레트 상태로 다시 검증한 뒤 집는다. 미래 실제 순서/arrival seed를 배치 입력에 전달하지 않는다. 각 로봇은 중앙 명령을 동시에 실행한다. 서브 운송 예약은 실제 컨베이어 큐이며 순서를 바꾸는 임시 적재 버퍼로 이용하지 않는다.

원래 단일 팔레트 알고리즘의 재고/제약을 고정하고, 로봇·팔레트 수 및 중앙 목적지 선택을 확장한 별도 실험이다. 전체 공급30개는 로봇마다30개가 아니다. 군집 셀 위치는 픽업이 고정 작업공간 내에 있도록 Y=-200mm offset을 사용한다. 기존 자유 공정의 레이아웃과 제약은 변경하지 않는다. 9초는 중앙 결정 전체 wall-clock 상한이다. Worker 준비 후 watchdog, 제시간 incumbent만 fallback, commit 재검증 포함10초 넘으면 명령 미실행. 10초는 목표/가정이며 컨베이어·관절을 포함하는 실물 cycle 측정값이 아니다.

## 실행한 검증
Vitest 기존 공정 회귀+새 군집 테스트 6파일44개 통과, TypeScript 빌드 통과. 새 테스트의 첫 순서 결과:

|SKU|로봇/팔레트|적재|미적재|최대 동시 운반|팔레트별 개수|
|---|---|---|---|---|---|
|6|1/1|25|5|1|25|
|6|4/4|30|0|3|12,8,6,4|
|8|4/4|30|0|3|10,8,6,6|

0.5초 이상적 테스트 tick 결과이며 브라우저 wall-clock 경합과 구별한다. JSON `cluster-fleet-{sku}-{robots}.json`에 실제 실행 상태 저장. 수량 보존/중복 예약/박스 중첩/높이/지지/누적하중/동시 운반/자동반출0 검증. 전체100순서, 원래7정책1400trial 또는 역사 signature 동일 재현은 실행하지 않았다.

## 출처 및 범위
사용자 군집 재현 가이드와 로컬 ALPS 소스를 기준으로 했다. 이 컴퓨터에 evaluation-v2/freeze.json 및 해당 source-snapshot을 찾지 못했으므로 reference signature `8bab669522ba33fdce1f082fe36fc5b8ff2f7f4b4e4dc100bba05912e2928feb`와 동일한 바이트/결과라고 주장하지 않는다. 기존 benchmark 기록은 수정하지 않는다. 강도 합성 가정, 공통 정적 지지/하중/그리퍼 swept/TCP workspace proxy이다. 진공 밀봉, 실제 전체 링크 IK/동역학, 실제 서버 통신, 센서, 운송 안정성은 미검증. 중앙서버 구조는 현재 브라우저 Worker로 실행한다.
