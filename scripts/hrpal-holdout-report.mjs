import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../docs/',import.meta.url);
const report=JSON.parse(readFileSync(new URL('hrpal-candidate-holdout.json',root),'utf8'));
const fmt=(v,d=2)=>v==null?'미검증':Number(v).toFixed(d);
const candidatePairs={};
for(const [mode,group] of Object.entries(report.groups)) {
 const diffs=Array.from({length:20},(_,i)=>{
  const a=group.rows.find(r=>r.caseId==='random'&&r.seed===100+i&&r.algorithm==='greedy');
  const b=group.rows.find(r=>r.caseId==='random'&&r.seed===100+i&&r.algorithm==='future-hybrid');
  return a.values.count-b.values.count;
 });
 const mean=diffs.reduce((a,b)=>a+b,0)/20,std=Math.sqrt(diffs.reduce((a,b)=>a+(b-mean)**2,0)/19),half=2.093*std/Math.sqrt(20);
 candidatePairs[mode]={mean,ci95:[mean-half,mean+half],wins:diffs.filter(x=>x>0).length,ties:diffs.filter(x=>x===0).length,losses:diffs.filter(x=>x<0).length};
}
const lines=['# ALPS · 현대 고정 패턴 기준선 후보 검증','',`실행 완료: ${report.createdAt}`,'',
 '## 결론의 범위','',
 '현대 HRPal 비공개 알고리즘 및 실제 현장 성능을 시험한 결과가 아니다. 공식 공개 기능을 참고해 직접 구현한 Conventional Pattern-Based Palletizing의 Column 기준선과 기존 ALPS 후보를 비교했다. 실제 HRPal이 생성한 패턴과 동일 현장 입력을 받기 전에는 현대 기술보다 우수하다고 확정할 수 없다.','',
 '[현대 HRPal 공식 기능 설명](https://www.hd-hyundairobotics.com/biz/product/support/287)','',
 '## 권장 후보','',
 '이 합성 조건에서는 Greedy를 1차 후보로 추천한다. 추가 회전을 허용한 조건의 적재 수 평균은 Greedy 10.7 / Hybrid 10.1 / Column 2.9개다. 수평 회전으로 통일하면 Greedy와 Hybrid 모두 3.95개이고 Column은 2.9개다. Greedy의 평균 계산시간은 Hybrid보다 작았다. 다만 두 후보의 적재 수 차이 신뢰구간은 아래와 같이 0을 포함하므로 적재 수만으로 유일한 승자라고 단정하지 않는다.','',
 ...Object.entries(candidatePairs).map(([mode,p])=>`- ${mode}: Greedy − Hybrid, 평균 ${fmt(p.mean)}개, 근사 95% CI [${p.ci95.map(v=>fmt(v)).join(', ')}], 승/동률/패 ${p.wins}/${p.ties}/${p.losses}.`),'',
 '단일 순서에서 승자가 바뀌는 문제는 하나의 실행 대신 고정된 고객 프로필과 여러 시드의 평균·최악값·계산시간으로 판단한다. 이번 시험에서 현대 실제 기술의 우월성·열등성을 결론낼 수는 없다.','',
 '## 실험 조건','',
 '기존 시드 42~46 결과로 Greedy / Future-Aware Hybrid를 사전 선정했다. 이번 시험은 새로운 시드 100~119만 사용했고 시험 중 파라미터를 조정하지 않았다.','',
 `${report.trials}회 = 3개 알고리즘 × 동일 12개·혼합 18개 × 새 시드 20개 × 회전 조건 2개. 워밍업 ${report.warmupTrials}회 및 Greedy 재현성 확인 ${report.reproducibilityTrials}회는 통계에서 제외했다.`, '',
 '로봇 1대·팔레트 1장·1000×800×1400 mm, 순차 입고, 버퍼 없음, 동일한 박스/질량/강도 가정/순서/공통 제약. 후보 상한 48, 판단 예산 60초, trial 300초로 설정했다. 실제 미래 순서는 평가기만 보유하며 온라인 계획기에 전달하지 않는다. 알고리즘 실행 순서를 시드별로 순환시켰다.','',
 `실행 환경: ${report.environment.node}, ${report.environment.platform}/${report.environment.arch}, ${report.environment.cpu}, worker ${report.environment.workers}개. 계산시간은 이 PC의 Node 측정값이다.`,''];
for(const [mode,group] of Object.entries(report.groups)) {
 lines.push(`## ${mode==='shared-upright'?'공정성 통제: 모두 수평 0°/90°':'기존 허용 자세: 후보 알고리즘의 추가 회전 포함'}`,'');
 if(mode==='native-allowed')lines.push('Column은 수평 0°/90°이고 다른 후보는 각 박스의 기존 허용 자세를 사용한다. 이 표의 차이는 배치 탐색과 회전 자유도의 효과가 함께 포함된다.','');
 for(const [caseId,rows] of Object.entries(group.byCase)) {
  lines.push(`### ${caseId==='identical'?'동일 규격 12개':'혼합 규격 18개'}`,'','| 알고리즘 | 평균 적재 수 | 완료율 % | 정격 부피율 % | 최소 지지율 평균 % | 평균 판단 ms | trial P95 평균 ms | 추정 총 작업 s |','|---|---:|---:|---:|---:|---:|---:|---:|');
  for(const row of rows){const m=row.metrics;lines.push(`| ${row.name} | ${fmt(m.count.mean)} | ${fmt(m.completion.mean)} | ${fmt(m.utilization.mean)} | ${fmt(m.supportMin.mean)} | ${fmt(m.meanMs.mean)} | ${fmt(m.p95Ms.mean)} | ${fmt(m.workSeconds.mean)} |`);}
  lines.push('','최소 지지율과 작업시간은 적재가 있는 실행에서만 평균한다. 배치가 없는 실행을 지지율 100%로 계산하지 않는다. 추정 총 작업시간이 작더라도 덜 적재해서 짧을 수 있으므로 작업 효율의 단독 근거로 삼지 않는다. 적재 높이도 적재한 박스 집합·수량이 같을 때만 직접 우열을 비교한다.','');
  for(const pair of group.pairedDifferences[caseId])lines.push(`- ${pair.algorithm} − Column, 같은 시드의 적재 수 차이: 평균 ${fmt(pair.count.mean)}개, 근사 95% CI [${pair.count.ci95?.map(v=>fmt(v)).join(', ')}]. 승/동률/패 = ${pair.wins}/${pair.ties}/${pair.losses}.`);
  lines.push('');
 }
}
lines.push('## 안전·정보 조건·재현성','',
 `확정 제약 위반 또는 실행 오류: ${report.invalid.length}개 trial. 배치 실패와 부분 적재는 제약 위반과 구분해 기록했다. 원시 지표는 실패를 숨기지 않는다.`, '',
 `${report.reproducibility.length}개 재실행의 확정 위치·자세·처분이 원 실행과 일치했다. 같은 시드·회전 조건·규격에서 입력 fingerprint와 전체 도착 순서를 알고리즘 간 비교해 일치를 검증했다.`, '',
 '지지·충돌·경계·높이·허용 회전·하중·그리퍼/TCP 경로는 기존 공통 정적 검사 범위다. 강도는 합성 가정이며 실측 압축강도 보증이 아니다. 실물 흡착·진공·관절 IK·전체 로봇 링크·동적 붕괴·실제 이마트 물류 조건은 미검증이다. 안전 검사를 완화하지 않았고 새로운 적재 알고리즘을 추가하거나 기존 알고리즘을 바꾸지 않았다.','',
 '신뢰구간은 독립 시드를 표본으로 둔 Student-t 근사다. 회전 조건과 규격별로 별도 분석하며 합쳐서 독립 표본을 부풀리지 않는다. 두 사전 선정 후보의 비교일 뿐 모든 고객·모든 분포에서의 최적성을 증명하지 않는다.','',
 '## 자료와 재실행','',
 '[원시 JSON](hrpal-candidate-holdout.json) · [기존 회전 CSV](hrpal-candidate-native-allowed.csv) · [수평 회전 CSV](hrpal-candidate-shared-upright.csv)','',
 '`npx vitest run tests/pallet-hyundai-holdout.test.ts --maxWorkers=1`','',
 '[기존 180회 비교와 3D 재생](https://pallet-loading-lab.eon3602.chatgpt.site/?palletView=single-study&v=39#pallet). 이 화면의 데이터는 시드 42~46의 기존 측정이다. 이번 240회는 위 별도 자료에서 확인하며 두 실험을 혼동하지 않는다.','',
 '## 실제 현대와의 비교에 필요한 다음 자료','',
 'HRPal이 동일 박스·팔레트 조건으로 만든 위치·방향·순서 데이터, 동일 회전 제한과 강도 정보, 로봇/그리퍼 모델 및 속도 프로필, 실제 입고 목록과 순서. 기존 neutral pattern adapter를 통해 공통 검증 엔진에서 평가해야 한다.','');
writeFileSync(new URL('HRPAL-CANDIDATE-HOLDOUT.md',root),lines.join('\n'));
console.log(JSON.stringify({trials:report.trials,invalid:report.invalid.length,candidatePairs,modes:Object.fromEntries(Object.entries(report.groups).map(([mode,g])=>[mode,{identical:g.byCase.identical.map(r=>({algorithm:r.algorithm,count:r.metrics.count.mean,meanMs:r.metrics.meanMs.mean})),mixed:g.byCase.random.map(r=>({algorithm:r.algorithm,count:r.metrics.count.mean,completion:r.metrics.completion.mean,meanMs:r.metrics.meanMs.mean,p95:r.metrics.p95Ms.mean,support:r.metrics.supportMin.mean}))}]))}));
