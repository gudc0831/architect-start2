# DailyGridBodyV2 Final Spike Plan

- Date: 2026-04-09
- Scope: `daily` desktop grid only
- Status: final approved plan
- Intent: replace the current table-bound hot path with a modern virtualized grid body while preserving current daily-grid behavior
- Parent docs:
  - [`2026-04-09-daily-grid-body-v2-spike-plan.md`](/D:/architect%20-%20start2/docs/2026-04-09-daily-grid-body-v2-spike-plan.md)
  - [`2026-04-09-spreadsheet-grid-handoff-status.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-09-spreadsheet-grid-handoff-status.md)
  - [`2026-04-08-grid-latency-remediation-methodology.md`](/D:/architect%20-%20start2/docs/2026-04-08-grid-latency-remediation-methodology.md)

## 1. Final Decision

이 스파이크는 현재 `<table>` 기반 daily body를 계속 미세 최적화하지 않는다.

대신 다음을 검증한다.

1. `@tanstack/react-virtual` 기반 `div`/`role="grid"` body로 바꾸면 row-height drag 체감이 즉시 개선되는가
2. overlay editor, selection, detail panel, drag/reorder, header filter UX를 유지할 수 있는가
3. DOM 기반 V2만으로 목표 체감에 충분히 도달하는가
4. 부족하면 canvas gate를 다시 열어야 하는가

이번 계획의 핵심은 "React 버전 업"이 아니라 "렌더링 substrate 교체"다.

## 2. Review Convergence

이 최종본은 아래 5개 리뷰 축이 모두 통과하도록 작성한다.

1. Architecture
   - table 의존 hot path 제거 여부
   - header/body/overlay ownership 분리 여부
2. Performance
   - drag frame 중 per-row update와 virtualizer resize만 남는지
   - body-level fan-out을 줄였는지
3. UX and Regression
   - selection, detail panel, overlay editor, sticky header, scroll parity 유지 여부
4. Sequencing
   - 파일 단위로 안전하게 구현 가능한지
   - V1/V2 공존과 kill switch가 있는지
5. Verification and Rollout
   - 측정 기준, 승인 기준, rollback 기준이 명확한지

승인 기준은 단순하다. 각 축에서 "추가 문서 수정 없이 바로 구현 착수 가능"이어야 한다.

## 2.1 Approval Status

All five review lanes are closed on this version of the document.

1. Architecture: approve
2. Performance: approve
3. UX and regression: approve
4. Sequencing and module boundaries: approve
5. Rollout and verification: approve

## 3. Non-Negotiables

아래는 이번 스파이크에서 바꾸면 안 되는 조건이다.

1. 코드 수정은 `daily` desktop grid 경로에만 한정한다.
2. 기존 `TaskListInlineEditorOverlay` 패턴은 유지한다.
3. persistence timing은 drag 종료 후 유지한다.
4. blank-space deselect와 detail panel reset은 회귀시키지 않는다.
5. board/calendar 화면은 이번 스파이크에 포함하지 않는다.
6. keyboard spreadsheet navigation 확장은 이번 스파이크 목표가 아니다.

## 4. Target Architecture

### 4.1 Screen Composition

`TaskWorkspace`

- `DailyGridHeaderV2`
- `DailyGridBodyV2`
- `TaskListInlineEditorOverlay`

핵심은 scrollable body만 바꾸는 것이다.

### 4.2 Header/Body Contract

header와 body는 하나의 `gridTemplateColumns` 문자열을 공유한다.

- source of truth: resolved task list column widths
- header uses the shared template for labels and resize handles
- body rows use the same template for cell alignment
- horizontal scroll sync is handled by one scroll container; header is visually sticky, not separately scrollable

이 계약을 문서에 명시하는 이유는 header/body width drift를 막기 위해서다.

### 4.3 Row Contract

`DailyGridRowV2`는 다음을 반드시 만족해야 한다.

1. row wrapper 한 곳만 `height` 를 가진다
2. 내부 cell은 `height: 100%` 와 shared grid template만 사용한다
3. row interaction은 taskId selector로 구독한다
4. resize handle, drag handle, selected row UI는 row 내부에서 유지한다

즉, V1처럼 active row의 모든 cell shell에 height를 쓰지 않는다.

### 4.4 Virtualization Contract

`DailyGridBodyV2`는 `@tanstack/react-virtual`을 사용한다.

- `count`: displayed daily rows
- `getItemKey`: `task.id`
- `estimateSize`: persisted row height + row chrome
- `overscan`: initial 4
- `rangeExtractor`: visible range + pinned indexes merge
- resize path: `virtualizer.resizeItem(index, nextOuterHeight)`

초기 스파이크에서는 column virtualization을 도입하지 않는다.

## 5. State Ownership

현재 병목은 `TaskListLayoutSnapshot` 전체 구독이다. V2에서는 ownership을 아래처럼 분리한다.

### 5.1 `TaskListRowMetricsStore`

- durable row heights
- transient live row height
- `subscribeRow(taskId)`
- `getDisplayedRowHeight(taskId)`
- `setTransientRowHeight(taskId, height | null)`
- `commitRowHeight(taskId, height)`

### 5.2 `TaskListViewportStore`

- scrollTop
- viewportHeight

### 5.3 `TaskListRowInteractionStore`

- selected row
- active inline edit cell
- task drop state
- focused-task dimming

### 5.4 Virtualizer Bridge

body에는 `taskId -> rowIndex` 맵이 필요하다.

이 맵은 아래 상황에서 사용한다.

1. `resizeItem(index, size)` 호출
2. pinned index 계산
3. active cell scroll-into-view
4. auto-fit 적용 후 row 재측정

## 6. Event Ownership Matrix

### 6.1 Scroll

- owner: `DailyGridBodyV2`
- writes: viewport store
- reads: virtualizer only

### 6.2 Row Resize Drag

- owner: `DailyGridBodyV2`
- urgent path:
  - calculate next height
  - `setTransientRowHeight`
  - `virtualizer.resizeItem`
- deferred path:
  - persist local storage and server patch on pointerup

### 6.3 Auto-Fit

- owner: shared measurement helper + body bridge
- hot path rules:
  - no measurement host rebuild in drag loop
  - result writes to row metrics store and `resizeItem`

### 6.4 Overlay Editor

- owner: `TaskWorkspace` + existing overlay component
- row/cell DOM refs come from V2 row cells
- body does not own editor lifecycle

### 6.5 Selection and Detail Panel

- owner: existing interaction store and task workspace orchestration
- V2 row only publishes the same click/dblclick/focus semantics as V1

## 7. Shared Logic Reuse

다음 로직은 V1/V2 공용으로 먼저 추출한다.

- `createTaskListRowPresentationContext`
- `buildTaskListCellPresentation`
- `buildTaskListRowMeasurementCells`
- `measureTaskListRowHeight`
- displayed row height resolver
- auto-fit cache key builder

즉, "무엇을 보여줄지"는 그대로 두고, "어떻게 렌더할지"만 바꾼다.

## 8. File Plan

### 8.1 New Files

- `src/components/tasks/task-grid-shared.ts`
  - row and cell presentation helpers
  - measurement helpers
- `src/components/tasks/task-grid-metrics-store.ts`
  - row metric store and selector hooks
- `src/components/tasks/task-grid-virtualizer.ts`
  - virtualizer config, pinned range merge, row index map helpers
- `src/components/tasks/daily-grid-header-v2.tsx`
  - sticky header using shared columns template
- `src/components/tasks/daily-grid-body-v2.tsx`
  - viewport, virtualizer, row mount orchestration, resize bridge
- `src/components/tasks/daily-grid-row-v2.tsx`
  - row wrapper, cells, handles, row-level subscriptions

### 8.2 Modified Files

- `src/components/tasks/task-workspace.tsx`
  - V1/V2 feature flag
  - prop wiring
  - overlay integration
  - V2 route only for desktop daily path
- `src/app/globals.css`
  - V2 layout styles
- `package.json`
  - add `@tanstack/react-virtual`

### 8.3 Files Explicitly Out of Scope

- board/calendar grid files
- canvas renderer files
- worker or Wasm related files

## 9. Implementation Sequence

### Phase A. Shared Extraction

Files:

- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/task-grid-shared.ts`

Goals:

1. extract presentation helpers
2. extract measurement helpers
3. keep V1 behavior unchanged

Gate:

- V1 still renders identically
- no behavior change in daily desktop path

### Phase B. Row Metrics Split

Files:

- `src/components/tasks/task-grid-metrics-store.ts`
- `src/components/tasks/task-workspace.tsx`

Goals:

1. isolate durable and transient row height state
2. add per-row subscriptions
3. stop treating viewport and row metrics as one snapshot

Gate:

- V1 still works on the new store
- no drag behavior regression

### Phase C. V2 Skeleton

Files:

- `src/components/tasks/daily-grid-header-v2.tsx`
- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/components/tasks/task-grid-virtualizer.ts`
- `src/components/tasks/task-workspace.tsx`
- `src/app/globals.css`

Goals:

1. add feature flag `USE_DAILY_GRID_BODY_V2`
2. render V2 only on desktop daily path
3. display visible rows via virtualizer
4. keep V1 as full kill switch fallback

Gate:

- V2 scrolls
- header and body columns align
- no edit flow connected yet

### Phase D. V2 Row and Interaction Parity

Files:

- `src/components/tasks/daily-grid-row-v2.tsx`
- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/app/globals.css`

Goals:

1. row wrapper owns height
2. row cell UI parity with V1
3. drag handle, resize handle, selected row style parity

Gate:

- selected row visuals match
- drag handle exists
- basic row click and double-click parity holds

### Phase E. Row Resize Hot Path Migration

Files:

- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/components/tasks/daily-grid-row-v2.tsx`
- `src/components/tasks/task-grid-metrics-store.ts`
- `src/components/tasks/task-grid-virtualizer.ts`
- `src/components/tasks/task-workspace.tsx`

Goals:

1. use `requestAnimationFrame` for drag loop
2. call `setTransientRowHeight`
3. call `virtualizer.resizeItem`
4. commit durable row height and persistence only on pointerup

Hot path rule:

- no table layout
- no full layout snapshot write
- no storage write
- no network write

Gate:

- active row reacts immediately
- sibling rows do not visibly jump beyond expected reflow
- persistence still occurs only after release

### Phase F. Overlay and Auto-Fit Integration

Files:

- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/components/tasks/daily-grid-row-v2.tsx`
- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/task-grid-shared.ts`

Goals:

1. connect active cell DOM rects to overlay editor
2. keep IME and composition-safe text editing behavior
3. connect auto-fit results to row metrics store and virtualizer

Gate:

- overlay aligns correctly
- Enter/Escape/blur behavior is unchanged
- auto-fit updates row placement correctly

### Phase G. Regression Closure and Signoff

Files:

- `src/components/tasks/task-grid-virtualizer.ts`
- `src/components/tasks/daily-grid-body-v2.tsx`
- `src/components/tasks/task-workspace.tsx`
- docs/worklogs

Goals:

1. pinned selected/editing/pending-focus rows remain mounted
2. blank-space deselect parity
3. detail panel reset parity
4. sticky header and horizontal scroll parity
5. kill switch kept intact

Gate:

- full browser QA pass succeeds
- signoff notes recorded

## 10. UX and Accessibility Parity Rules

### 10.1 Selection

- row click selects the row
- blank-space click clears selection
- detail panel heading resets correctly after deselect

### 10.2 Keyboard and Focus

- current Enter/blur handling stays unchanged
- `isComposing` IME guard stays unchanged
- active cell must remain scroll-visible when focused programmatically
- V2 does not introduce new spreadsheet arrow navigation in this spike

### 10.3 Accessibility Semantics

- root: `role="grid"`
- header cells: `role="columnheader"`
- row: `role="row"`
- cells: `role="gridcell"`
- selected row exposes `aria-selected`
- row and column indexes are provided where needed for assistive context

### 10.4 Scroll and Sticky Behavior

- sticky header stays visually locked
- horizontal scroll remains aligned across header and body
- row resize must not cause scroll jump larger than the active row delta

## 11. Performance Budgets

이 문서는 구현 전 목표 budget도 고정한다.

### 11.1 Required Outcomes

1. mounted rows should remain at visible rows + overscan + pinned rows
2. row resize drag should not trigger persistence writes mid-drag
3. row resize drag should not trigger body-wide DOM height mutation

### 11.2 Target Measurements

1. 1440px desktop at 200 rows
2. repeated row resize on a mid-table row
3. visible mounted rows counted before and during drag
4. performance trace around drag

### 11.3 Success Thresholds

1. visible mounted rows remain bounded and stable
2. drag interaction feels materially faster than V1
3. no obvious full-screen stall or header hitch during repeated drags

이 단계에서는 exact millisecond budget보다 regression-free perceptual win을 먼저 승인 기준으로 삼는다. 다만 trace는 반드시 남긴다.

## 12. Verification Plan

### 12.1 Code Verification

- `npm run typecheck`
- `npm run build`

### 12.2 Browser Verification

1. `preview/daily` desktop baseline
2. 50-row and 200-row scenarios
3. row resize in top, middle, bottom visible regions
4. active cell edit open/close
5. blank-space deselect
6. detail panel reset
7. sticky header while scrolling
8. console errors = 0

### 12.3 Artifacts to Keep for Signoff

- one before/after screenshot pair
- one performance trace or measured observation note
- mounted row count note
- explicit statement whether canvas gate stays closed

## 13. Feature Flag and Rollback

### 13.1 Feature Flag Strategy

- default: V1
- enable V2 only in desktop daily path
- keep one explicit kill switch in `task-workspace.tsx`

### 13.2 Rollback Rule

아래 중 하나면 V2 기본 활성화를 멈추고 V1로 되돌린다.

1. drag parity가 좋아지지 않는다
2. overlay editor alignment가 불안정하다
3. blank-space deselect 또는 detail panel reset이 회귀한다
4. mounted rows or scroll behavior가 예측 불가능하게 흔들린다

## 14. Canvas Reopen Conditions

아래면 DOM V2 이후에도 canvas gate를 다시 연다.

1. 200+ rows에서 drag 중 body 전체 hitch가 남는다
2. row wrapper 단일 height ownership으로도 frame drops가 뚜렷하다
3. overlay + tree row + reorder 유지 비용이 너무 커진다
4. body recompute보다 rendering substrate가 여전히 주 병목으로 확인된다

## 15. Final Approval Checklist

아래가 모두 `yes` 면 이 계획은 더 손보지 않고 구현에 들어간다.

1. shared extraction 순서가 명확한가
2. row metrics, viewport, interaction ownership이 분리되어 있는가
3. header/body width sync 규칙이 문서에 명시되었는가
4. row resize hot path에서 남겨야 할 작업과 제거해야 할 작업이 명확한가
5. overlay editor와 IME/focus parity가 명시되었는가
6. verification artifacts와 rollback 기준이 명시되었는가
7. canvas reopen 조건이 분명한가

이 체크리스트 기준으로는 추가 문서 보강 없이 바로 구현 착수 가능해야 한다.
