# DailyGridBodyV2 Spike Plan

- Date: 2026-04-09
- Scope: `daily` desktop grid only
- Status: approved planning baseline after 5-agent review loop
- Parent analysis:
  - [`2026-04-09-spreadsheet-grid-handoff-status.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-09-spreadsheet-grid-handoff-status.md)
  - [`2026-04-08-grid-latency-remediation-methodology.md`](/D:/architect%20-%20start2/docs/2026-04-08-grid-latency-remediation-methodology.md)
  - [`2026-04-09-daily-row-resize-latency-root-cause-plan.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-09-daily-row-resize-latency-root-cause-plan.md)

## 1. 목표

이번 스파이크의 목표는 현재 `<table>` 기반 daily body를 바로 전면 교체하는 것이 아니라, 아래를 검증 가능한 작은 단위로 입증하는 것이다.

1. 행 높이 드래그 중 table layout 비용을 제거할 수 있는가
2. visible row만 유지하는 body에서 현재 기능을 유지할 수 있는가
3. 기존 overlay editor, selection, detail panel 흐름을 깨지 않고 연결할 수 있는가
4. DOM 기반 V2만으로도 체감 목표에 충분히 근접하는가

사용자 목표는 명확하다.

- Google Sheets처럼 드래그 즉시 반응해야 한다
- 리사이즈 중 전체 화면이 같이 버벅이면 안 된다
- 최신 기술을 쓰되, 지금 프로젝트 구조에 안전하게 들어와야 한다

## 2. 이번 스파이크의 결론적 방향

### 채택

- `@tanstack/react-virtual` 기반 row virtualization
- `<table>` body 대신 `div` 기반 `role="grid"` body
- sticky header와 scroll body 분리
- overlay editor는 기존 DOM overlay 유지
- row metric은 per-row 기준으로 관리
- 드래그 중 높이 반영은 row wrapper 1개와 virtualizer item size만 갱신

### 보류

- canvas body 전환
- WasmGC / worker 계산 최적화
- 전체 keyboard spreadsheet navigation
- board / calendar 화면 동시 전환

이유는 단순하다. 현재 문제는 계산 엔진이 아니라 table + layout + body recompute 경로다.

## 3. 설계 원칙

1. `task-workspace.tsx` 에서 hot path를 계속 키우지 않는다.
2. 행 높이 변경은 "셀 15개 DOM 직접 수정"이 아니라 "행 wrapper 1개 높이 수정"으로 바꾼다.
3. body 전체 snapshot 구독 대신, row와 viewport를 분리해 구독한다.
4. V1과 V2를 feature flag로 공존시켜 회귀 위험을 낮춘다.
5. 기존 row presentation 규칙은 재사용하고, 렌더링 substrate만 바꾼다.

## 4. 목표 아키텍처

### 4.1 화면 구조

`TaskWorkspace`

- `DailyGridHeaderV2`
- `DailyGridBodyV2`
- `TaskListInlineEditorOverlay`

핵심 변화는 body다.

- header는 고정된 column width를 공유하는 `div` grid
- body는 scroll viewport + virtual rows
- row는 absolute positioning 또는 translated row wrapper
- cell은 `display: grid` 기반 column track 공유

### 4.2 렌더링 구조

`DailyGridBodyV2`

1. scroll viewport ref를 가진다
2. `useVirtualizer` 로 visible rows를 계산한다
3. `rangeExtractor` 또는 pinned index merge로 selected/editing row를 강제 유지한다
4. 각 virtual row는 `DailyGridRowV2` 로 렌더한다
5. row drag height 변경 시 `virtualizer.resizeItem(index, nextOuterHeight)` 를 호출한다

`DailyGridRowV2`

1. row wrapper 한 곳만 `height` 를 가진다
2. 내부 cell은 `height: 100%` 로 채운다
3. row interaction state는 taskId 단위로만 구독한다
4. row presentation은 shared helper에서 만든다

### 4.3 상태 구조

현재 문제는 `TaskListLayoutSnapshot` 전체 구독이다. V2에서는 아래처럼 나눈다.

`TaskListRowMetricsStore`

- durable row heights
- transient live row height
- per-row subscribe
- viewport 전체와 분리

`TaskListViewportStore`

- scrollTop
- viewportHeight

`TaskListRowInteractionStore`

- 기존 selected row / active cell / drop state 유지

body는 viewport + visible index 계산을 담당하고, row는 자기 taskId의 interaction + row metric만 구독한다.

### 4.4 결정이 필요한 설계 포인트와 이번 스파이크의 확정안

이번 문서는 아래 항목을 더 이상 열린 선택지로 두지 않는다.

1. row order source of truth
   - V2 body는 이미 정렬/필터/트리 반영이 끝난 `rows` 를 입력으로 받는다.
   - virtualizer index의 source of truth는 `rows[index]` 이며, 별도 business ordering 로직은 만들지 않는다.
   - `taskId -> index` map은 V2 body 내부에서 `rows` 변경 시마다 다시 만든다.
2. header와 body의 horizontal sync
   - body viewport가 수평/수직 스크롤의 source of truth를 가진다.
   - header는 body `scrollLeft` 를 mirror한다.
   - header와 body에 독립 scroll container를 두지 않는다.
3. row outer height 기준
   - virtualizer size는 `row content height + row chrome height` 를 기준으로 계산한다.
   - content height와 chrome height를 혼용하지 않는다.
4. overlay editor용 cell ref registry
   - V1의 table-cell ref 수집 방식을 그대로 복제하지 않는다.
   - grid-agnostic registry 계약을 두고 `taskId + columnKey -> HTMLElement` 조회만 유지한다.
5. accessibility baseline
   - 스파이크 단계의 baseline은 `role="grid"`, `role="row"`, `role="gridcell"` 과 기존 aria-label 유지다.
   - full spreadsheet roving tabindex와 arrow-key cell navigation은 이번 범위 밖이다.

### 4.5 V2에서 꼭 분리해야 하는 책임

`TaskWorkspace`

- 데이터 준비
- 기존 business action 전달
- overlay editor 상태/저장 흐름 유지
- V1/V2 분기

`DailyGridBodyV2`

- scroll viewport
- virtualizer
- visible range 계산
- header scroll sync source
- row mount orchestration

`DailyGridRowV2`

- row wrapper layout
- row interaction state 구독
- row cell render
- row resize handle / row drag handle 연결

`task-grid-metrics-store`

- durable row height
- transient drag row height
- per-row subscriber notification
- virtualizer와 연결할 resize 신호의 source

### 4.6 width / scroll sync ownership

이 항목은 1차 계획안에서 빠졌던 결정이다.

V2에서는 아래를 명시적으로 하나의 source of truth로 둔다.

- column widths: `task-workspace.tsx` 의 기존 column width state 유지
- horizontal scroll position: body viewport가 source of truth
- header scroll sync: body `scrollLeft` 를 header container에 반영

즉 header가 body를 따라가야 하며, header 자체가 별도 scroll state를 갖지 않는다.

### 4.7 row resize ownership

row resize는 V2 body가 직접 소유해야 한다.

이유:

- V1의 `applyTaskListRowHeightToDom` 는 table cell shell 전제 로직이다
- V2에서는 virtualizer index와 row wrapper height를 같이 알아야 한다

따라서 역할을 아래처럼 나눈다.

- `task-workspace.tsx`
  - durable persist callback만 소유
- `daily-grid-body-v2.tsx`
  - pointer drag state
  - `requestAnimationFrame` batching
  - `virtualizer.resizeItem(...)`
  - transient live row metric 반영
- `task-grid-metrics-store.ts`
  - durable / transient row height 저장

### 4.8 accessibility and keyboard parity boundary

이번 스파이크는 spreadsheet-style full keyboard navigation을 만들지 않는다.
대신 기존 parity는 아래까지만 보장한다.

1. row selection
2. active cell focus entry
3. overlay editor focus trap 없음
4. blur / save / cancel 흐름 유지
5. sticky header 상태에서 pointer / keyboard focus가 깨지지 않음

즉 "새 키보드 모델 추가"가 아니라 "기존 키보드/포커스 회귀 방지"가 범위다.

## 5. 기존 코드 재사용 전략

완전히 새로 쓰지 말고 아래 로직은 shared module로 먼저 추출한다.

- `createTaskListRowPresentationContext`
- `buildTaskListCellPresentation`
- `buildTaskListRowMeasurementCells`
- `measureTaskListRowHeight`
- `resolveTaskListDisplayedRowHeight`
- row auto-fit cache key 생성 로직

즉, "무엇을 보여줄지"는 재사용하고, "어떻게 배치하고 그릴지"만 바꾼다.

## 6. 제안 파일 구조

### 새 파일

- `src/components/tasks/task-grid-types.ts`
  - shared type aliases, prop contracts, row size helpers
- `src/components/tasks/daily-grid-body-v2.tsx`
  - virtualizer, viewport, pinned range, row mount orchestration
- `src/components/tasks/daily-grid-row-v2.tsx`
  - row wrapper, cell render, row resize handle
- `src/components/tasks/daily-grid-header-v2.tsx`
  - sticky header replacement
- `src/components/tasks/task-grid-shared.ts`
  - row presentation, cell presentation, measurement helpers
- `src/components/tasks/task-grid-metrics-store.ts`
  - row height store + selector hooks
- `src/components/tasks/task-grid-dom-registry.ts`
  - overlay editor and focus flow를 위한 `taskId + columnKey -> HTMLElement` registry
- `src/components/tasks/task-grid-virtualizer.ts`
  - virtualizer setup, pinned range helper, outer height resolver

### 수정 파일

- `src/components/tasks/task-workspace.tsx`
  - feature flag, V1/V2 분기, prop wiring, overlay editor 연결
- `src/app/globals.css`
  - V2 grid/header/body/row/cell 스타일
- `package.json`
  - `@tanstack/react-virtual` 추가

### 이번 스파이크에서 만들지 않는 파일

- canvas renderer 전용 파일
- board/calendar 공용 grid foundation
- worker/Wasm 관련 파일
- row/column business derivation 전용 파일

### 의존성 도입 원칙

- 이번 스파이크에서 새 runtime dependency는 `@tanstack/react-virtual` 하나만 허용한다
- grid library 자체를 추가하지 않는다
- canvas 기반 대안은 spike 실패 시 다음 decision gate에서만 검토한다

## 7. 파일 단위 작업 순서

순서는 중요하다. 이 순서를 바꾸면 diff가 커지고 회귀 위험이 올라간다.

### Step 0. spike guardrail 먼저 추가

수정:

- `package.json`
- `src/components/tasks/task-workspace.tsx`

할 일:

1. `@tanstack/react-virtual` 의존성 추가
2. V2를 강제로 끌 수 있는 단일 kill switch 정의
3. spike 단계에서 사용할 on/off 기준을 문서화

확정안:

- build-time flag: `NEXT_PUBLIC_DAILY_GRID_BODY_V2`
- runtime debug flag: `localStorage` 또는 query flag 중 하나
- build-time flag가 `off` 면 runtime flag가 있어도 V2는 켜지지 않는다

완료 기준:

- spike 상태에서 V2를 켜고 끄는 경로가 코드와 문서 둘 다에서 명확하다

### Step 1. shared 로직 추출

추가 결정:

- `task-grid-types.ts` 를 먼저 만들어 shared type과 prop contract를 분리한다.
- `task-grid-dom-registry.ts` 로 overlay editor / focus 이동에 필요한 DOM registry 계약을 먼저 고정한다.

수정:

- `src/components/tasks/task-workspace.tsx`

추가:

- `src/components/tasks/task-grid-shared.ts`

할 일:

1. row presentation helper를 shared로 이동
2. measurement helper를 shared로 이동
3. V1 코드가 shared를 사용하도록 바꿔 동작 동일성 유지

완료 기준:

- V1 동작 변화 없음
- `task-workspace.tsx` 에서 row presentation 관련 길이가 줄어든다

### Step 2. row metric store 분리

추가 결정:

- viewport state는 row metric과 같은 store에 두지 않는다.
- `taskId -> index` map은 business layer가 아니라 V2 body가 `rows` 입력으로부터 매번 재생성한다.

추가:

- `src/components/tasks/task-grid-metrics-store.ts`

수정:

- `src/components/tasks/task-workspace.tsx`

할 일:

1. row heights / live row height 로직을 별도 store로 추출
2. per-row selector hook 추가
3. V1도 새 store를 사용하게 맞춰 동작 동일성 유지

완료 기준:

- 기존 `TaskListLayoutStore` 가 body-level layout snapshot에 과도하게 묶이지 않는다
- row metric 경로를 V2에서 재사용할 수 있다

### Step 3. V2 header/body 기본 뼈대 추가

추가 결정:

- body viewport가 horizontal scroll source of truth를 가진다.
- header는 body `scrollLeft` 를 mirror하고 독립 스크롤을 갖지 않는다.
- 초기 스파이크에서는 column virtualization을 도입하지 않는다.

추가:

- `src/components/tasks/daily-grid-header-v2.tsx`
- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/components/tasks/task-grid-virtualizer.ts`

수정:

- `src/components/tasks/task-workspace.tsx`
- `src/app/globals.css`

할 일:

1. feature flag `USE_DAILY_GRID_BODY_V2` 추가
2. desktop `daily` 에서만 V2 렌더 분기 추가
3. header는 기존 column width를 공유하는 grid header로 구성
4. body는 virtualizer로 visible rows만 렌더

완료 기준:

- V2에서 스크롤/기본 렌더가 동작
- selection 없이도 row 목록이 깨지지 않고 보임

### Step 4. V2 row 컴포넌트 연결

추가 결정:

- row key는 `task.id`
- cell key는 `task.id + column.key`
- 접근성 baseline은 `role="grid"`, `role="row"`, `role="gridcell"` 유지다.

추가:

- `src/components/tasks/daily-grid-row-v2.tsx`

수정:

- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/app/globals.css`

할 일:

1. row wrapper 높이를 단일 style로 적용
2. grid template columns를 column widths에서 생성
3. row interaction store를 taskId 단위로 구독
4. resize handle / drag handle / selected row style 이식

완료 기준:

- 행 높이 표시, 선택, 드래그 핸들 UI가 V2에서 동작
- row wrapper 1개만 높이를 소유한다

### Step 5. row resize hot path를 V2 방식으로 전환

추가 결정:

- resize handle은 pointer capture를 사용한다.
- row size는 `content height + row chrome height` 기준으로만 virtualizer에 전달한다.
- scroll jump 확인을 위해 active row 위쪽 spacer 변화도 검증 항목에 넣는다.

수정:

- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/components/tasks/daily-grid-row-v2.tsx`
- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/task-grid-metrics-store.ts`
- `src/components/tasks/task-grid-virtualizer.ts`

할 일:

1. 드래그 중 `requestAnimationFrame` 에서 최신 height만 적용
2. `virtualizer.resizeItem(...)` 로 active row size 즉시 반영
3. row wrapper 한 곳만 height 수정
4. `pointerup` 에서 durable row height persist
5. V1 전용 `applyTaskListRowHeightToDom` 경로는 V2 활성 시 우회
6. drag 중 body는 "전체 snapshot 교체" 대신 virtualizer item size와 active row metric만 갱신

완료 기준:

- drag 중 active row만 즉시 자란다
- sibling row와 header가 덜 흔들린다
- localStorage / server persist는 drag 종료 후만 일어난다

### Step 6. overlay editor와 auto-fit 연결

추가 결정:

- overlay editor는 기존 바깥 DOM overlay를 유지하고 body 내부 editor로 바꾸지 않는다.
- IME composition, blur commit, save/cancel parity를 별도 확인 항목으로 둔다.
- Tab 이동, Enter commit, Escape cancel의 baseline은 V1과 동일하게 유지한다.

수정:

- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/components/tasks/daily-grid-row-v2.tsx`
- `src/components/tasks/task-grid-shared.ts`

할 일:

1. active cell DOM rect를 V2 row cell 기준으로 overlay editor에 전달
2. auto-fit 계산 결과를 row metric store + virtualizer에 연결
3. active cell 편집 / blur / save / cancel 흐름 유지

완료 기준:

- overlay editor가 V2 cell 위에 정확히 뜬다
- auto-fit 이후 row 위치가 정상 업데이트된다

### Step 7. pinned row와 회귀 대응

추가 결정:

- pinned row merge는 custom range merge로 처리하되 duplicate mount는 허용하지 않는다.
- selected row, editing row, pending focus row 세 종류만 pinned 대상으로 유지한다.

수정:

- `src/components/tasks/task-grid-virtualizer.ts`
- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/components/tasks/task-workspace.tsx`

할 일:

1. selected row / editing row / pending focus row pinned mount 유지
2. blank-space deselect 회귀 방지
3. detail panel reset 회귀 방지
4. html drag reorder 및 manual reorder 흐름 확인
5. horizontal scroll 중 header/body width sync 확인
6. narrow desktop width에서 sticky header clipping 여부 확인

완료 기준:

- 기존 회귀 이슈가 다시 나오지 않는다

### Step 8. signoff와 kill switch 정리

추가 결정:

- preview와 real daily를 따로 signoff 한다.
- 실패 시 rollback 기준은 "V2 flag off 시 V1이 즉시 정상 동작" 하나로 단순화한다.

수정:

- `src/components/tasks/task-workspace.tsx`
- `docs/worklogs/...`

할 일:

1. V2 플래그 on/off 분기 정리
2. 실패 시 V1로 즉시 되돌릴 수 있게 유지
3. 측정 결과와 남은 리스크 기록

완료 기준:

- release 전에도 안전하게 끌 수 있다

## 8. 구현 우선순위 세부 메모

### 8.1 가장 먼저 줄여야 하는 비용

1. table layout
2. active row 15개 cell shell height mutation
3. body-level snapshot fan-out

### 8.2 V2에서 꼭 지켜야 할 제약

1. row wrapper만 높이를 가진다
2. body는 visible rows만 렌더한다
3. interaction store는 taskId selector를 유지한다
4. overlay editor는 body 내부가 아니라 바깥 DOM overlay를 유지한다
5. column template string은 header/body row 단위에서 계산하고 cell 단위에서 다시 만들지 않는다
5. header scroll position은 body viewport에서만 파생한다
6. V2 drag path는 table DOM helper를 재사용하지 않는다

### 8.3 이번 스파이크에서 허용되는 타협

1. 초기에는 column virtualization까지 하지 않는다
2. pinned row는 custom range merge로 처리한다
3. `measureElement` 자동 측정보다 `resizeItem` 명시 갱신을 우선한다

### 8.4 중간 중단 지점과 gate

Gate A: Step 0~3 종료 시점

- V2 body가 visible rows만 정상 렌더
- header/body horizontal sync 정상
- V1 fallback 정상

Gate B: Step 5 종료 시점

- row resize hot path가 table DOM mutation 경로를 타지 않음
- active row drag 체감이 V1보다 명확히 나음
- scroll jump가 허용 범위 안에 있음

Gate C: Step 6~7 종료 시점

- overlay editor, selection, deselect, detail panel reset 회귀 없음
- preview와 real daily 둘 다 signoff 가능

어느 gate에서든 실패하면 다음 단계로 밀지 않고 원인과 fallback 여부를 먼저 기록한다.

## 9. 검증 기준

### 코드 레벨

- `npm run typecheck`
- `npm run build`

### 브라우저 레벨

1. `preview/daily` 에서 desktop 확인
2. 50 / 200 row 수준에서 스크롤 확인
3. row resize 중 active row만 즉시 반응하는지 확인
4. 인접 row가 과하게 점프하지 않는지 확인
5. blank-space deselect 동작 확인
6. detail panel reset 확인
7. active cell overlay editor 위치 확인
8. console error 0 확인
9. horizontal scroll 중 header/body column alignment 확인
10. IME 입력 중 blur/save 동작 회귀 없음 확인

### 프로파일링 레벨

반드시 남겨야 할 관찰:

1. drag 중 commit phase 체감 감소 여부
2. visible row 수와 mounted row 수
3. drag 한 프레임 동안 long task 체감 여부

스파이크에서 최소한 기록할 정량 기준:

1. dataset 기준: `daily` desktop 50 row / 200 row
2. mounted row 목표: `visible + overscan + pinned`
3. drag 중 연속 long task 발생 여부
4. V1 대비 visible body 흔들림이 줄었는지 여부
4. drag 중 scripting / layout 중 어느 쪽이 더 큰지 메모
5. V1 대비 "active row 외 visible row rerender" 감소 여부

### 산출물

이번 스파이크가 끝나면 최소 아래 산출물이 있어야 한다.

1. V2 feature flag가 연결된 코드 경로
2. V1/V2 비교 메모
3. 브라우저 검증 기록
4. 중단 여부 또는 계속 진행 여부 결정

## 10. 스파이크 성공 기준

아래를 만족하면 V2를 계속 진행할 가치가 있다.

1. row resize 체감이 V1보다 명확히 빠르다
2. selection / edit / deselect / detail panel 흐름이 유지된다
3. 코드가 `task-workspace.tsx` 단일 파일보다 분리되어 관리 가능하다
4. 캔버스 없이도 목표에 충분히 근접한다

## 11. 스파이크 중단 조건

아래 중 하나면 즉시 canvas gate를 다시 연다.

1. V2에서도 row resize 중 visible body 전체가 계속 크게 흔들린다
2. 200+ row에서 DOM path가 여전히 frame budget을 넘는다
3. overlay editor + tree row + drag/reorder 유지 비용이 과도하다
4. div grid 전환으로도 table 대비 체감 개선이 작다

## 12. 최종 권고

다음 구현 턴에서는 Step 0~3까지만 먼저 끝내는 것이 맞다.

이유:

- 가장 위험한 부분은 V2 body 진입이지, row UX 디테일이 아니다
- shared extraction 없이 바로 V2 row를 만들면 `task-workspace.tsx` 의존성이 너무 커진다
- 먼저 "같은 데이터/같은 프레젠테이션을 V2 body에서 띄울 수 있는가"를 입증해야 이후 리사이즈 최적화가 안전하다

즉, 다음 작업의 실제 1차 목표는 아래다.

1. shared extraction
2. row metric store 분리
3. feature-flagged `DailyGridBodyV2` 기본 렌더

행 높이 드래그의 최종 체감 개선은 그 다음 턴에서 집중해도 된다.

## 13. 5-agent review closure

이 문서는 아래 5개 review lane 기준으로 더 이상 필수 수정이 없을 때 닫는다.

1. architecture agent
   - 승인 기준: rendering substrate, ownership, source of truth 명확
2. performance agent
   - 승인 기준: resize hot path, virtualizer size 경로, pinned strategy 명확
3. ux/regression agent
   - 승인 기준: selection, overlay, focus, deselect, detail reset 기준 명확
4. sequencing agent
   - 승인 기준: extraction 순서와 file boundary가 hidden coupling 없이 실행 가능
5. rollout agent
   - 승인 기준: flag, gate, rollback, preview/real daily signoff 기준 명확

현재 문서는 위 5개 lane 모두에 대해 아래를 만족하는 상태를 목표로 한다.

- 열린 핵심 설계 질문 없음
- 다음 구현 턴에서 Step 0~3 착수가 가능함
- 실패 시 어느 gate에서 멈출지 문서만 보고 판단 가능함

### Approval ledger

- architecture lane: approved after ownership, source-of-truth, and scroll-sync clarification
- performance lane: approved after hot-path, `resizeItem(...)`, and gate criteria clarification
- ux/regression lane: approved after overlay, focus, IME, deselect, and detail reset boundaries were made explicit
- sequencing lane: approved after Step 0 guardrail, file boundaries, and extraction order were tightened
- rollout lane: approved after flag, preview-vs-real signoff, rollback, and spike artifact requirements were added

## 14. State Ownership Matrix

This section exists to remove hidden coupling before implementation starts.

### `task-workspace.tsx`

Keeps ownership of:

- task query results and mutation entrypoints
- current project / auth / preview mode gating
- detail panel state
- filter state
- draft task state
- feature-flag branch between V1 and V2
- overlay editor mount and save/cancel orchestration

Must stop owning directly:

- V2 row layout math
- V2 row wrapper height application
- V2 visible-range calculation

### `task-grid-metrics-store.ts`

Owns:

- durable row heights
- transient live drag height
- per-row subscription API
- batch replace API for layout restore / preference load

Must not own:

- detail panel state
- selected row state
- draft form state

### `task-grid-virtualizer.ts`

Owns:

- row outer height resolver
- pinned index merge or range extractor
- scroll-to-row helper
- virtualizer config defaults

Must not own:

- cell presentation logic
- persistence logic

### `daily-grid-body-v2.tsx`

Owns:

- viewport ref
- virtualizer instance
- visible row rendering
- drag-time `resizeItem(...)` bridging
- body-level scroll sync

Must not own:

- task save logic
- detail panel logic
- inline edit draft mutation rules

### `daily-grid-row-v2.tsx`

Owns:

- row wrapper height style
- row grid template application
- row-level interaction subscription
- row cell rendering and resize handle dispatch

Must not own:

- viewport state
- global persistence timers

## 15. Feature Flag and Rollout Plan

The spike must be safe to turn on and off without touching task data.

### Flag shape

Add one local flag only:

- `USE_DAILY_GRID_BODY_V2`

Recommended evaluation order:

1. local constant for initial spike
2. preview-only enablement
3. optional query-param or preview toggle for side-by-side QA

Do not:

- enable V2 in production by default during the spike
- reuse unrelated feature flags
- mix V1 and V2 row bodies in the same viewport

### Rollout stages

1. `off by default`
   - V2 code exists, V1 remains default
2. `preview only`
   - enable on `preview/daily`
3. `internal comparison`
   - same dataset, V1 vs V2 visual and interaction comparison
4. `candidate`
   - V2 default only after spike exit criteria are satisfied

### Kill switch rule

If any spike blocker appears, one edit in `task-workspace.tsx` must return the daily desktop body to V1.

## 16. Verification Matrix by Stage

### After Step 1

- V1 renders identically
- no row presentation helper duplication remains
- measurement helpers still return the same heights on representative rows

### After Step 2

- row metric store can load, replace, and clear live height
- V1 row resize still works
- layout restore still applies saved heights

### After Step 3

- V2 shows the same row order and same column widths as V1
- scroll container and sticky header remain aligned
- selected row can still stay visible when forced or pinned

### After Step 5

- active row drag updates within one frame budget in normal desktop use
- no storage write happens during `pointermove`
- visible row repositioning is stable under repeated drag

### After Step 6

- overlay editor anchors to the correct V2 cell
- IME typing, blur, save, and cancel still behave correctly
- auto-fit updates both stored height and virtualizer item size

### After Step 7

- blank-space deselect still works
- detail panel reset still works
- selected/editing/pending-focus pinning survives scroll
- no new console errors are introduced

## 17. Observability and Comparison Data

The spike is not complete without evidence. Keep the evidence lightweight.

### Required comparison notes

Capture and record:

- visible row count
- mounted row count
- average drag feel at 50 rows
- average drag feel at 200 rows
- whether body-wide jumping is visible
- whether header/body alignment drifts during scroll or resize

### Useful instrumentation

If needed, add temporary marks during the spike only:

- `performance.mark` around drag-start / drag-frame / drag-end
- console counters for body renders and row renders in dev only
- a one-line dev summary of visible virtual items and pinned items

Do not:

- introduce permanent noisy logs
- keep debug counters enabled in the final path without a guard

## 18. Risk Register

### Risk A. Header and body width drift

Mitigation:

- one shared column-width source
- one shared `gridTemplateColumns` builder
- verify across horizontal scroll and resize

### Risk B. Overlay editor anchor mismatch

Mitigation:

- expose one stable cell ref registration path for V2
- compare active-cell rects between V1 and V2 during QA

### Risk C. Pinned row logic fights the virtualizer

Mitigation:

- isolate pinned range logic in `task-grid-virtualizer.ts`
- test selected row, active edit row, and pending focus row separately

### Risk D. Row drag path still feels slow

Mitigation:

- keep the row wrapper as the only drag-time height owner
- keep `resizeItem(...)` in the urgent path
- reopen canvas gate if DOM V2 still misses target

## 19. Approval Checklist for the Five Review Lenses

The plan should be treated as ready only when all five lenses can answer "yes".

### Architecture lens

- Is the rendering substrate change explicit enough
- Is state ownership separated enough to keep V2 maintainable

### Performance lens

- Does the urgent resize path avoid table layout and broad snapshot fan-out
- Does the plan name the next likely bottleneck if V2 still misses target

### UX/regression lens

- Are selection, detail panel, overlay editing, and drag handles covered
- Are sticky header and scroll alignment checks explicit

### Sequencing lens

- Can Step 1 through Step 3 be implemented without hidden module deadlocks
- Can V1 remain stable while V2 is introduced

### Verification/release lens

- Is there a clear flag, rollout, kill switch, and exit criterion
- Is there enough comparison evidence to decide whether to continue or stop

## 20. Five-Role Review Transcript

이 섹션은 실제 구현 전에 계획안 자체를 닫기 위한 검토 기록이다.

- review scope: plan document only
- non-goal during review: code changes 금지

### Round 1

`choi` coordinator verdict: `revise`

- 빠져 있던 점:
  - source of truth for header/body scroll sync
  - spike 산출물 정의
  - 의존성 도입 상한

`hy` architecture reviewer verdict: `revise`

- 빠져 있던 점:
  - row resize ownership 분리
  - V1 table helper와 V2 path 절연 규칙

`ung` performance reviewer verdict: `revise`

- 빠져 있던 점:
  - drag 중 full snapshot update 금지 문구
  - profiling 관찰 항목 구체화

`ch` UX/review verdict: `revise`

- 빠져 있던 점:
  - keyboard/focus parity boundary
  - horizontal scroll / sticky header alignment 검증
  - IME 관련 회귀 확인

`ul` correctness/release verdict: `revise`

- 빠져 있던 점:
  - spike 종료 산출물 명시
  - dependency introduction limit

### Round 1 actions applied

이 문서에 아래 항목을 추가 반영했다.

1. section 4.4 width / scroll sync ownership
2. section 4.5 row resize ownership
3. section 4.6 accessibility and keyboard parity boundary
4. dependency introduction rule
5. row resize hot path 금지 조건 보강
6. browser / profiling verification 항목 보강
7. spike 산출물 명시

### Round 2

`choi` coordinator verdict: `approve`
`hy` architecture reviewer verdict: `approve`
`ung` performance reviewer verdict: `approve`
`ch` UX/review verdict: `approve`
`ul` correctness/release verdict: `approve`

### Closure rule

이 계획안은 현재 기준으로 "손볼 필요 없는 수준의 spike entry plan" 으로 닫는다.
다음 수정은 계획안 보강이 아니라 실제 구현 중 드러난 측정 결과에 의해서만 연다.
