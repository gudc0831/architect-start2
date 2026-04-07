# 스프레드시트급 그리드 반응성 전환 계획

- 작성일: 2026-04-07
- 기준 문서: [`../PLAN.md`](../PLAN.md)
- 상태: `future plan`
- 목적: 현재 daily task grid를 "행 단위로 즉시 반응하는 도구형 UI"에서 한 단계 더 밀어, Google Sheets / Excel에 가까운 체감 성능으로 전환하기 위한 실제 구현 순서와 의사결정 기준을 정리한다.

## 1. 이 문서의 역할

- `PLAN.md`는 운영 방향과 앞으로의 계획에 들어간 항목을 최소한으로 연결하는 문서로 유지한다.
- 이 문서는 스프레드시트급 반응성 전환을 위한 실제 작업 단위, 대상 파일, 기술 선택, 검증 기준, 중단 조건을 관리한다.
- 범위는 `daily` 데스크톱 그리드를 우선 대상으로 삼되, 이후 `board`와 다른 dense grid 화면으로 재사용 가능한 구조를 만드는 데 둔다.
- Google Sheets의 실제 내부 렌더러 소스는 공개되어 있지 않으므로, 본 문서는 공개된 Google 자료와 공개 grid 기술 문서, 현재 repo 코드 구조를 함께 근거로 삼는다.

## 2. 대화 스토리와 결정 흐름

이번 계획은 아래 대화 흐름을 기준으로 정리한다.

1. 사용자는 "행 높이를 늘이고 줄일 때 딜레이가 심하다"며 원인이 화면 렌더링인지, 배포 전 상태인지 먼저 확인해 달라고 요청했다.
2. 코드 검토 결과, 주원인은 네트워크나 배포 전 상태보다 클라이언트 렌더 경로에 더 가깝다고 판단했다.
3. 사용자는 하네스 스타일 검토와 작업 준비를 요청했고, 이어서 "구글 스프레드시트처럼 각 행별 반응이 빠르길 원한다"고 목표를 명확히 했다.
4. 그 요구에 맞춰 1차 구현으로 행 높이 드래그 중 전체 React 상태를 매 프레임 갱신하지 않고, 활성 행 DOM만 즉시 높이를 바꾸고 `pointerup`에서만 상태와 저장을 커밋하는 fast-path를 적용했다.
5. 같은 작업에서 `taskFiles={filesByTaskId[task.id] ?? []}`로 인해 빈 배열 참조가 매번 바뀌며 `memo`가 깨지던 문제도 정리했다.
6. 구현 후 `typecheck`, `build`, 브라우저 검증을 통해 "드래그 중 활성 행만 즉시 반응하고 다른 행은 그대로 유지"되는 수준까지는 확보했다.
7. 그 다음 질문은 "Google Sheets / Excel처럼 더 빠르게 반응하려면 어떤 방향이 좋은가"였고, 여기서 로컬 코드와 공개된 최신 기술 자료를 함께 검토했다.
8. 조사 결과, 현재 repo는 이미 리사이즈 핫패스를 줄였지만 dense grid 본체는 여전히 전체 DOM table 기반이고, 구글 시트류 체감으로 가려면 viewport 기반 렌더링 모델 전환이 핵심이라는 결론에 도달했다.
9. 사용자는 이 결론을 1~5단계 구현안으로 정리하고, `PLAN.md`에는 최소한의 연결만 남기며, 세부 계획서는 이번 대화 흐름까지 포함한 스토리형 문서로 남기라고 요청했다.

즉 이 문서는 "이미 한 차례 핫패스 최적화는 끝냈고, 이제 구조 전환을 어떻게 순서대로 할 것인가"를 다루는 후속 아키텍처 계획서다.

## 3. 현재 코드 기준 출발점

### 3.1 이미 확보된 것

- 행 높이 드래그 중 활성 행 DOM 높이만 직접 바꾸는 fast-path가 있다.
- 최종 높이 저장과 서버 patch는 드래그 종료 시점에만 일어난다.
- 파일 없는 행의 `taskFiles` prop은 안정된 빈 배열 참조를 쓰도록 정리되었다.
- `DailyTaskTableRow`는 `memo`로 감싸져 있고, 기본적인 props equality check가 있다.

### 3.2 아직 남아 있는 구조적 한계

1. 데스크톱 daily 화면은 여전히 `dailyTreeRows.map(...)`로 모든 visible row를 한 번에 렌더한다.
2. 각 row는 `dailyTaskListColumns` 기준 15개 컬럼을 모두 그린다.
3. dense grid 본체가 여전히 HTML `<table>` 중심이다.
4. 셀 표시용 DOM과 편집용 UI가 같은 row 렌더 경로 안에 묶여 있다.
5. row height, selection, drop target, inline edit 상태가 모두 같은 큰 React tree 안에서 상호 영향을 준다.
6. repo에는 `react-window`, `react-virtualized`, `@tanstack/react-virtual` 같은 viewport virtualization 의존성이 아직 없다.

### 3.3 현재 코드 기준 핵심 파일

- `src/components/tasks/task-workspace.tsx`
  - row height DOM fast-path
  - daily desktop table 렌더링
  - `DailyTaskTableRow`
  - auto-fit measurement
- `src/domains/task/daily-list.ts`
  - 15개 daily column 정의
  - full task tree row builder
- `package.json`
  - React `19.2.3`
  - Next `16.1.6`

## 4. 핵심 판단

### 4.1 원인 판단

- "배포 전이라서 느리다"는 보조 요인일 수는 있다.
- 하지만 현재 체감 병목의 주원인은 dev/prod 차이보다 dense grid 렌더링 구조다.
- 프로덕션 빌드는 같은 구조를 조금 덜 느리게 만들 수는 있지만, Google Sheets / Excel급 체감으로 끌어올리는 핵심 해법은 아니다.

### 4.2 공개 자료 기준 판단

- Google은 계산 엔진 쪽에서 WasmGC와 worker 기반 최적화를 공개했다.
- 공개 grid 자료들은 대규모 데이터에서 DOM virtualisation, buffered rendering, canvas rendering을 핵심 전략으로 둔다.
- Glide Data Grid는 FAQ에서 scrolling performance를 이유로 virtualized DOM에서 canvas로 전환했다고 설명한다.
- 따라서 현재 repo의 다음 단계는 "핫패스 미세최적화 반복"보다 "viewport 중심 구조 전환"이 우선이다.

## 5. 목표와 비목표

### 목표

1. 행 높이 드래그, 선택 이동, 스크롤이 "활성 행 또는 viewport만 반응한다"는 체감으로 바뀐다.
2. 200행 이상 데이터에서도 DOM 수가 viewport 기준으로 제한된다.
3. 편집기, 선택, 상세 패널, 필터 같은 보조 UI가 grid 본체의 frame budget을 무너뜨리지 않는다.
4. 향후 board/calendar형 dense list에도 재사용 가능한 grid foundation을 만든다.
5. 필요 시 canvas-backed body로 확장 가능한 구조를 남긴다.

### 이번 계획의 비목표

1. 이번 문서 단계에서 바로 canvas 전체 전환을 확정 구현하는 것
2. Google Sheets와 동일한 렌더링 엔진을 재현한다고 주장하는 것
3. 한 번의 change set으로 daily/board/calendar 모든 화면을 동시에 갈아엎는 것
4. 접근성, 키보드 이동, 에디터 UX를 성능만 보고 희생하는 것

## 6. 성능 설계 원칙

1. 보이지 않는 row는 렌더하지 않는다.
2. 표시용 셀과 편집용 UI를 분리한다.
3. urgent interaction과 non-urgent derivation을 분리한다.
4. 큰 React tree 전체 구독 대신 granular subscription을 쓴다.
5. 측정은 cache하고, layout thrash는 피한다.
6. dense grid 본체는 필요하면 DOM보다 canvas가 더 적합하다는 사실을 열어 둔다.

## 7. 권장 구현 순서

아래 1~5단계는 "앞 단계가 다음 단계를 쉽게 만들도록" 설계했다. 기본 순서는 유지하는 편이 안전하다.

### 1단계. Viewport Row Virtualization 전환

#### 제목

`Phase 1. Daily Desktop Grid Row Virtualization`

#### 목적

- 전체 `<table>` 렌더링을 viewport 중심으로 바꿔, 실제 DOM row 수를 "보이는 row + overscan" 수준으로 제한한다.

#### 왜 먼저 해야 하는가

- 현재 가장 큰 비용은 dense grid 전체 DOM 유지다.
- 이 단계가 끝나야 이후 단계들의 효과가 곱해진다.
- display/edit 분리, 외부 store, scheduling 모두 virtualization 위에서 더 잘 작동한다.

#### 권장 기술 선택

- 1차 기본안: `@tanstack/react-virtual`
- 구조: `<table>` 유지보다 `div role="grid"` 또는 hybrid grid shell로 전환하는 쪽을 우선 검토
- 이유:
  - variable row height 대응이 상대적으로 유연하다
  - tree row, overlay, sticky UI를 섞기 쉽다
  - 이후 canvas body 검토 시 구조 전환 비용을 줄인다

#### 주요 구현 항목

1. daily desktop row list를 viewport container + virtual row list로 교체한다.
2. `dailyTreeRows` 전체 map을 제거하고 visible virtual items만 그린다.
3. row height는 기본 최소 높이 + 사용자 조절 높이 map을 그대로 재사용하되, virtualizer estimate/measure 경로를 붙인다.
4. sticky header는 grid 본체와 분리해서 유지한다.
5. selection, active row, drop indicator가 virtual row unmount/remount에도 깨지지 않게 ref와 id 중심으로 유지한다.
6. auto-fit 이후 row height 변경 시 virtualizer가 해당 row measurement를 다시 반영하도록 한다.

#### 대상 파일 후보

- `src/components/tasks/task-workspace.tsx`
- 필요 시 신규 분리:
  - `src/components/tasks/task-grid-viewport.tsx`
  - `src/components/tasks/task-grid-row.tsx`
  - `src/components/tasks/task-grid-header.tsx`

#### 기술 메모

- 현재 tree indentation, drag/drop, resize handle, selected row, overdue badge는 모두 row renderer에 붙어 있다.
- virtualization 적용 시 DOM index보다 `task.id`를 source of truth로 잡아야 한다.
- row reorder drag는 virtual scroll과 충돌하기 쉬우므로 pointer/drag 이벤트 경로를 별도 확인해야 한다.

#### 검증

1. 50행, 200행, 500행 샘플에서 DOM row 수가 viewport + overscan으로 제한되는지 확인
2. 스크롤 중 long task가 의미 있게 줄었는지 확인
3. 기존 row resize, auto-fit, selection, drop indicator가 유지되는지 확인
4. `preview/daily`에서 브라우저 체감 확인

#### 완료 기준

- desktop daily grid가 더 이상 전체 row를 한 번에 렌더하지 않는다.
- scroll과 row resize에서 visible 영역 밖 row는 렌더 비용을 거의 만들지 않는다.
- 행 높이 조절이 1차 핫패스 + virtualization 구조 위에서 동시에 유지된다.

#### 중단 조건

- variable row height와 tree indentation 때문에 1차 도입 비용이 과도하면, 먼저 fixed-ish row strategy로 축소해서 진입하고 auto-fit 정밀도는 2차로 미룬다.

### 2단계. Display Layer / Edit Layer 분리

#### 제목

`Phase 2. Lightweight Display Cells + Overlay Editor`

#### 목적

- 표시용 cell은 가볍게 유지하고, 실제 편집 input/select/textarea는 활성 셀 또는 활성 row에만 overlay로 띄우는 구조로 바꾼다.

#### 왜 필요한가

- 지금은 표시 DOM과 편집 UI가 같은 row 렌더 함수 안에 있다.
- dense grid가 스프레드시트처럼 빠르게 느껴지려면 대부분의 셀은 "그냥 텍스트/배지/아이콘"만 그려야 한다.
- 편집기가 여러 row와 함께 렌더되면 virtualization 이후에도 낭비가 남는다.

#### 주요 구현 항목

1. `TaskListInlineEditor`를 row 내부 렌더에서 직접 생성하지 않고 overlay host로 옮긴다.
2. 활성 셀 위치 계산은 row id + column key + DOM rect 기준으로 한다.
3. read mode cell presentation과 edit mode overlay state를 분리한다.
4. 더블클릭 또는 키보드 진입 시 display cell은 selection만 바꾸고, editor mount는 별도 레이어에서 수행한다.
5. 멀티라인 텍스트 셀과 categorical editor의 포커스/commit/cancel 경로를 공통화한다.

#### 대상 파일 후보

- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/task-list-inline-editor.tsx`
- 신규 분리 가능:
  - `src/components/tasks/task-grid-editor-overlay.tsx`
  - `src/components/tasks/task-grid-selection-store.ts`

#### 검증

1. 편집 진입/확정/취소 흐름이 기존과 동일하게 동작하는지
2. 편집하지 않는 row의 렌더 cost가 줄었는지
3. virtualization 상태에서 offscreen row editor가 남지 않는지

#### 완료 기준

- 대부분의 visible cell은 lightweight display node만 렌더한다.
- 실제 editor는 활성 셀 또는 활성 row 주변에만 mount된다.

### 3단계. Granular Store / Subscription 분리

#### 제목

`Phase 3. External Grid Store with Granular Subscriptions`

#### 목적

- row height, selection, hover, drag state, viewport state를 큰 parent state 묶음에서 떼고, row 또는 overlay 단위 구독으로 바꾼다.

#### 권장 기술 선택

- React 공식 경로: `useSyncExternalStore`
- 필요 시 내부 store는 간단한 custom store로 시작
- 외부 전역 상태 라이브러리를 새로 넣는 것은 우선순위가 아님

#### 왜 필요한가

- virtualization만으로 DOM 수는 줄지만, 같은 parent state에 많은 UI 상태가 물려 있으면 visible row 전체 재렌더는 여전히 남는다.
- 스프레드시트 체감은 "선택 변경 하나가 모든 visible row에 번지지 않는 것"과 강하게 연결된다.

#### 주요 구현 항목

1. `taskListRowHeights`, active cell, selected row, drag target, viewport meta를 grid store로 분리한다.
2. row component는 자기 자신에게 필요한 snapshot만 구독한다.
3. detail panel, filter strip, summary UI는 grid core state와 느슨하게 연결한다.
4. selection 이동과 hover highlight는 store mutation으로 처리하고, heavy derivation은 분리한다.

#### 기술 메모

- 현재 코드의 `taskListLayoutInteractionVersionRef`는 "무언가 바뀌었다"를 추적하는 보조 ref다.
- 3단계에서는 이런 mutable refs를 더 체계적인 grid state container로 정리할 수 있다.

#### 검증

1. active row 변경 시 불필요한 visible row 재렌더가 줄어드는지
2. drag/drop target 이동 중 row-level subscription만 갱신되는지
3. 선택 이동 시 detail panel과 grid core가 서로 과도하게 다시 그려지지 않는지

#### 완료 기준

- grid hot path 상태가 parent component 전체 렌더와 분리된다.
- React DevTools 기준 선택/hover/resize 상호작용의 re-render fan-out이 의미 있게 축소된다.

### 4단계. Interaction Scheduling / Measurement Budget 정리

#### 제목

`Phase 4. Urgent vs Non-Urgent Scheduling and Measurement Control`

#### 목적

- 빠르게 반응해야 하는 상호작용과 나중에 처리해도 되는 파생 작업을 분리해 main-thread budget을 안정화한다.

#### 권장 기술 선택

- React: `startTransition`, `useDeferredValue`
- Browser:
  - `requestAnimationFrame`
  - `ResizeObserver`
  - 필요 시 `scheduler.yield()` 또는 `scheduler.postTask` 계열 검토

#### 주요 구현 항목

1. filter/sort/search 파생 UI 중 non-urgent 경로를 `startTransition`으로 분리한다.
2. 무거운 summary recompute나 detail side effects는 interaction frame 밖으로 민다.
3. row auto-fit measurement는 cache와 invalidate rule을 만든다.
4. 연속 resize/scroll 중 동기 측정이 반복되지 않도록 requestAnimationFrame 경로를 명확히 한다.
5. 드래그 중 localStorage/server persistence는 이미 end-of-interaction 기준이므로, 같은 원칙을 다른 layout interaction에도 적용한다.

#### 왜 이 단계가 4단계인가

- 1~3단계 없이 scheduling만 먼저 해도 체감 개선은 제한적이다.
- 하지만 virtualization + editor 분리 + granular store 이후에는 scheduling 정리가 frame 안정성을 크게 끌어올릴 수 있다.

#### 검증

1. 긴 입력 후 UI가 잠기지 않는지
2. filter/search 반영 중 pointer interaction이 유지되는지
3. auto-fit과 resize가 연속으로 일어나도 layout thrash가 과도하지 않은지

#### 완료 기준

- urgent interaction path는 가볍고 예측 가능해진다.
- non-urgent derivation은 UI blocking을 만들지 않는 경로로 옮겨진다.

### 5단계. Canvas-backed Grid Body 의사결정 및 전환

#### 제목

`Phase 5. Canvas Grid Body Decision Gate`

#### 목적

- 1~4단계 이후에도 목표 체감에 못 미치면, dense grid 본체를 canvas 기반으로 전환할지 결정한다.

#### 이 단계가 마지막인 이유

- canvas는 가장 강력한 성능 카드이지만 구현 비용과 접근성, 에디터/선택/IME 처리 비용이 크다.
- 먼저 DOM virtualization 구조를 만든 뒤, 그래도 부족할 때 들어가는 것이 안전하다.

#### 선택지

1. 기존 repo 구조 위에 custom canvas body를 설계
2. Glide Data Grid 같은 canvas 계열 grid를 검토
3. hybrid 전략:
   - body는 canvas
   - header, toolbar, detail panel, editor overlay는 React DOM 유지

#### 주요 구현 항목

1. 셀 그리기 모델 정의
2. 선택/포커스/편집 overlay 동기화
3. tree row 시각화와 drag affordance 재설계
4. 접근성 대체 전략
5. IME와 멀티라인 편집기의 안전한 overlay 처리

#### 의사결정 게이트

- 1~4단계 후 아래 조건을 모두 만족하면 5단계를 미뤄도 된다.
  - row resize / scroll / selection이 충분히 빠르다
  - 200행 이상에서 visible DOM cost가 관리 가능하다
  - 향후 기능 추가 시 구조가 유지 가능하다
- 반대로 아래 중 하나라도 남으면 5단계 착수 검토
  - dense dataset에서 여전히 frame drop이 크다
  - visible row 수가 적어도 cell DOM 자체가 병목이다
  - 편집기/selection overlay를 분리했는데도 본체 repaint가 과도하다

## 8. 단계별 추천 산출물

각 단계가 끝날 때 아래 산출물을 남기는 것을 기본안으로 한다.

1. 짧은 worklog
2. before/after 브라우저 검증 메모
3. 필요한 경우 프로파일링 스크린샷 또는 측정값
4. 다음 단계로 넘어가도 되는지에 대한 `proceed / revise / stop` 판단

## 9. 권장 성공 지표

아래는 현재 측정값이 아니라 목표 지표다.

1. row resize 드래그 중 활성 행 외 visible row 재렌더가 거의 없다.
2. 200행 이상 데이터에서 DOM row 수가 전체 row 수와 무관하게 viewport 기준으로 제한된다.
3. selection 이동, hover, inline edit 진입이 frame drop 없이 즉시 반응한다.
4. detail panel과 grid interaction이 서로의 hot path를 침범하지 않는다.
5. `preview/daily` 검증에서 "Google Sheets처럼 각 행이 즉시 따라온다"는 사용자 체감 목표를 충족한다.

## 10. 권장 검증 순서

1. `npm run typecheck`
2. `npm run build`
3. `preview/daily` 데스크톱 기준 브라우저 검증
4. 실제 `daily` 화면 검증
5. large dataset 시나리오 점검
6. 회귀 확인:
   - row resize
   - auto-fit double click
   - selection
   - drag reorder
   - inline edit
   - detail panel 연동

## 11. 리스크와 주의점

1. `<table>`에서 virtualization 가능한 구조로 바꾸는 순간 sticky header, column width sync, row overlay 좌표 계산이 복잡해질 수 있다.
2. tree indentation과 drag/drop은 일반적인 flat list virtualization보다 난도가 높다.
3. variable row height가 있기 때문에 virtualizer estimate/measure 전략을 초기에 잘 잡아야 한다.
4. canvas 전환은 성능 면에서는 유리할 수 있지만 접근성과 개발 난도가 급격히 오른다.
5. editor overlay 분리 시 IME, multiline text, scroll-follow 동기화가 중요한 회귀 포인트다.

## 12. 권장 실행 결론

현재 시점의 기본 권장안은 아래와 같다.

1. 먼저 `1단계 row virtualization`
2. 바로 이어서 `2단계 display/edit 분리`
3. 그 다음 `3단계 granular store`
4. 이후 `4단계 scheduling 정리`
5. 마지막으로 `5단계 canvas 여부 결정`

핵심은 "지금 당장 더 미세한 리사이즈 최적화를 계속하는 것"보다 "dense grid 본체를 viewport 중심으로 바꾸는 것"이 더 큰 승수라는 점이다.

## 13. 참고 근거

- Google Workspace Blog, 2024-06-26: Google Sheets calculation speed / innovations
- Google Workspace Updates, 2025-02-03: everyday Google Sheets actions improvements
- web.dev case study: Google Sheets WasmGC migration
- React docs: `useSyncExternalStore`, `startTransition`, `useDeferredValue`
- TanStack Virtual docs
- AG Grid DOM virtualisation docs
- Glide Data Grid FAQ
- Chrome Developers scheduling docs
- MDN `OffscreenCanvas`

## 14. 다음 실행 요청이 들어오면 바로 할 일

다음 실제 구현 요청이 들어오면 아래 순서로 진행한다.

1. `Phase 1` 범위를 `daily desktop`에 한정해 세부 설계안 작성
2. 필요한 의존성 추가 여부와 `<table>` 유지/전환 결정을 먼저 고정
3. `task-workspace.tsx`에서 grid body를 분리하는 change set 시작
4. 브라우저 검증 루프를 `preview/daily` 기준으로 반복
5. `Phase 1` 종료 후 체감과 프로파일링을 보고 `Phase 2` 착수 여부 결정

브랜치 분리 및 통합 절차는 [`2026-04-07-spreadsheet-grid-branch-operations.md`](./2026-04-07-spreadsheet-grid-branch-operations.md)에서 관리한다.
