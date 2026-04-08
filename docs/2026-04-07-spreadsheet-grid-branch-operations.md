# 스프레드시트 그리드 작업 브랜치 운영안

- 작성일: 2026-04-07
- 업데이트: 2026-04-08
- 기준 문서: [`../PLAN.md`](../PLAN.md)
- 연계 계획: [`2026-04-07-spreadsheet-grid-performance-plan.md`](./2026-04-07-spreadsheet-grid-performance-plan.md)
- 목적: 현재 시점의 변경 상태를 기준점으로 고정한 뒤, 스프레드시트급 그리드 성능 전환 작업을 임시 브랜치에서 단계별로 진행하고 이후 안전하게 통합할 수 있도록 실행 절차를 남긴다.

## 1. 이 문서의 전제

- 이 문서는 원래 "당시 워크트리 전체를 기준점으로 고정한다"는 전제로 작성되었다.
- 이후 실제 기준점은 `2026-04-08` 현재 커밋으로 확정되었고, baseline / integration / phase1 브랜치가 이미 생성되었다.
- 따라서 이 문서의 실행 파트는 두 가지로 읽는다.
  - 이미 수행된 bootstrap 기록
  - 이후 같은 흐름으로 phase를 이어 가는 재개 가이드
- 이후 스프레드시트 성능 전환 작업은 `phase branch -> integration branch -> 원래 브랜치 통합` 순서로 진행한다.

## 2. 현재 시점 기준 스냅샷

실제 브랜치 부트스트랩을 수행한 시점의 상태는 아래와 같다.

- 기준 커밋: `601845b` `feat: improve paged daily list navigation`
- 원래 브랜치: `codex/detailcheckout_260402`
- 원격 추적 상태: `origin/codex/detailcheckout_260402`와 동일
- baseline 브랜치: `codex/grid-baseline-20260408`
- integration 브랜치: `codex/grid-integration-20260408`
- 현재 활성 phase 브랜치: `codex/grid-p1-virtualization`
- 부트스트랩 직전 워크트리 상태: clean

중요:

- 이후 재개 시에도 반드시 `git status -sb`로 실제 상태를 먼저 다시 확인한다.
- 이 문서의 예시 브랜치명은 실제 생성된 `20260408` 기준으로 읽는다.

## 3. 브랜치 역할

이후 운영은 아래 브랜치 구성을 기본안으로 한다.

- `codex/detailcheckout_260402`
  - 현재 작업의 원래 브랜치
  - 이후 최종 통합을 받는 대상 브랜치
- `codex/grid-baseline-20260408`
  - 현재 시점의 전체 변경 상태를 고정하는 체크포인트 브랜치
- `codex/grid-integration-20260408`
  - 스프레드시트 성능 전환용 통합 브랜치
- `codex/grid-p1-virtualization`
  - 1단계 row virtualization 전용
- `codex/grid-p2-editor-overlay`
  - 2단계 display/edit 분리 전용
- `codex/grid-p3-grid-store`
  - 3단계 granular store 전용
- `codex/grid-p4-scheduling`
  - 4단계 scheduling/measurement 전용
- `codex/grid-p5-canvas-spike`
  - 5단계 canvas 검토용 실험 브랜치

## 4. 핵심 운영 규칙

1. 기준점 확정 시에는 `stash`가 아니라 `baseline commit`으로 고정한다.
2. 스프레드시트 성능 전환의 핵심 파일은 `phase branch`에서만 수정한다.
3. 핵심 파일이란 우선 아래를 뜻한다.
   - `src/components/tasks/task-workspace.tsx`
   - `src/domains/task/daily-list.ts`
   - `src/app/globals.css`
4. 여러 phase 브랜치를 동시에 오래 열어 두지 않는다.
5. 한 번에 한 phase만 active로 두고, 검증 후 `grid-integration`으로 머지한다.
6. 원래 브랜치에서 grid 핵심 파일 수정이 계속되면 통합 비용이 급격히 커진다. 가능하면 원래 브랜치에서는 grid 비핵심 파일만 수정한다.
7. `canvas spike`는 본선 구현 브랜치와 분리한다.

## 5. 최초 실행 커맨드 순서

아래 순서는 "지금 상태를 기준점으로 확정하고, 그 기준점에서 phase 작업 브랜치를 시작"하는 기본 절차다.

참고:

- 이 bootstrap은 실제로 `2026-04-08` 기준 커밋 `601845b`에서 수행되었다.
- 브랜치가 이미 존재한다면 이 섹션을 다시 실행하지 말고, `8. 나중에 다시 이어서 작업할 때의 재개 절차`부터 본다.

### 5.1 현재 상태 재확인

```powershell
git branch --show-current
git status -sb
git log --oneline --decorate --graph --max-count=15
```

기대값:

- 현재 브랜치가 `codex/detailcheckout_260402`
- 현재 미커밋 변경이 위 스냅샷과 크게 다르지 않음

### 5.2 기준점 브랜치 생성

```powershell
git switch -c codex/grid-baseline-20260408
```

설명:

- 현재 기준점을 새 브랜치로 고정한다.
- 아직 커밋은 하지 않는다.

### 5.3 현재 시점 전체를 체크포인트 커밋으로 고정

```powershell
git add -A
git commit -m "chore: checkpoint spreadsheet grid baseline 2026-04-08"
```

설명:

- 이 커밋은 정리용 checkpoint다.
- 메시지가 완벽할 필요는 없지만, 날짜와 baseline 용도는 남기는 편이 좋다.

### 5.4 통합 브랜치 생성

```powershell
git switch -c codex/grid-integration-20260408
```

설명:

- 이후 phase 브랜치는 모두 이 브랜치에서 분기한다.
- baseline 브랜치는 기준점 보존용으로 남겨 둔다.

### 5.5 1단계 작업 브랜치 생성

```powershell
git switch -c codex/grid-p1-virtualization
```

설명:

- 첫 실작업은 `Phase 1. Daily Desktop Grid Row Virtualization`부터 시작한다.

## 6. Phase 브랜치별 기본 작업 루프

아래 절차를 각 단계마다 반복한다.

### 6.1 Phase 작업 시작

예시: 1단계 시작

```powershell
git switch codex/grid-integration-20260408
git switch -c codex/grid-p1-virtualization
```

예시: 2단계 시작

```powershell
git switch codex/grid-integration-20260408
git switch -c codex/grid-p2-editor-overlay
```

### 6.2 작업 중 자주 확인할 명령

```powershell
git status -sb
git diff --stat
git log --oneline --decorate --graph --max-count=15
```

### 6.3 검증 명령

```powershell
npm run typecheck
npm run build
```

브라우저 검증은 문서상 아래 기준으로 수행한다.

- `preview/daily`
- row resize
- auto-fit
- selection
- drag reorder
- inline edit
- detail panel 연동

### 6.4 Phase 커밋 예시

```powershell
git add -A
git commit -m "feat: virtualize daily desktop task grid rows"
```

2단계 이후 예시:

```powershell
git add -A
git commit -m "refactor: split grid display cells from editor overlay"
```

### 6.5 Integration 브랜치로 병합

```powershell
git switch codex/grid-integration-20260408
git merge --no-ff codex/grid-p1-virtualization
```

설명:

- `--no-ff`를 유지해 두면 나중에 어느 phase가 들어왔는지 추적하기 쉽다.
- 2단계 이후도 같은 방식으로 phase 브랜치를 integration 브랜치에 머지한다.

## 7. 단계별 실제 브랜치 시작 순서

권장 순서는 아래와 같다.

### 7.1 Phase 1

```powershell
git switch codex/grid-integration-20260408
git switch -c codex/grid-p1-virtualization
```

작업 범위:

- row virtualization
- viewport container
- sticky header 구조 정리
- variable row height 대응 전략 1차 반영

### 7.2 Phase 2

```powershell
git switch codex/grid-integration-20260408
git switch -c codex/grid-p2-editor-overlay
```

작업 범위:

- display cell 경량화
- overlay editor host 분리
- active cell 위치 계산

### 7.3 Phase 3

```powershell
git switch codex/grid-integration-20260408
git switch -c codex/grid-p3-grid-store
```

작업 범위:

- `useSyncExternalStore` 기반 또는 동등한 외부 store
- row/selection/drag 상태의 granular subscription

### 7.4 Phase 4

```powershell
git switch codex/grid-integration-20260408
git switch -c codex/grid-p4-scheduling
```

작업 범위:

- `startTransition`
- `useDeferredValue`
- 측정 cache
- interaction scheduling 정리

### 7.5 Phase 5

```powershell
git switch codex/grid-integration-20260408
git switch -c codex/grid-p5-canvas-spike
```

작업 범위:

- canvas-backed body feasibility
- 성능 실험
- 본선 전환 여부 판단

주의:

- 5단계는 실험 브랜치다.
- 바로 integration에 합치지 않고, 실험 결과가 충분히 설득력 있을 때만 선택적으로 병합한다.

## 8. 나중에 다시 이어서 작업할 때의 재개 절차

다른 시점에 돌아와 작업을 이어야 하면 아래 순서로 재개한다.

### 8.1 현재 전체 상태 확인

```powershell
git branch --show-current
git status -sb
git branch
git log --oneline --decorate --graph --all --max-count=30
```

### 8.2 integration 기준으로 어디까지 끝났는지 확인

```powershell
git branch --merged codex/grid-integration-20260408
```

읽는 법:

- `codex/grid-p1-virtualization`가 merged 목록에 있으면 1단계는 integration에 반영됨
- 다음 미완료 phase 브랜치를 새로 만들면 됨

### 8.3 다음 phase 시작

예: 2단계부터 재개

```powershell
git switch codex/grid-integration-20260408
git switch -c codex/grid-p2-editor-overlay
```

예: 기존 phase 브랜치가 이미 있고 이어서 작업해야 함

```powershell
git switch codex/grid-p2-editor-overlay
git status -sb
```

### 8.4 문서 기준 재개 위치

재개 시 아래 문서를 먼저 본다.

- 성능 구조 계획: [`2026-04-07-spreadsheet-grid-performance-plan.md`](./2026-04-07-spreadsheet-grid-performance-plan.md)
- 브랜치 운영 문서: 이 문서
- 관련 worklog: `docs/worklogs/2026-04-07-*.md`

## 9. 원래 브랜치가 계속 움직였을 때의 통합 규칙

원래 브랜치 `codex/detailcheckout_260402`가 계속 수정될 수 있으므로 아래 규칙을 지킨다.

### 9.1 원래 브랜치에 grid 비핵심 변경만 들어간 경우

안전한 순서:

```powershell
git switch codex/grid-integration-20260408
git merge --no-ff codex/detailcheckout_260402
```

그 다음:

```powershell
npm run typecheck
npm run build
```

설명:

- 원래 브랜치의 최신 변경을 integration에 먼저 흡수한다.
- 이 상태에서 다음 phase를 진행하거나 최종 통합 전 검증을 수행한다.

### 9.2 원래 브랜치에서도 grid 핵심 파일이 바뀐 경우

규칙:

1. 바로 phase 작업을 계속하지 않는다.
2. 먼저 `grid-integration`에서 원래 브랜치를 머지한다.
3. 충돌을 해결한다.
4. `typecheck`, `build`, 브라우저 검증을 다시 수행한다.
5. 그 다음 phase로 넘어간다.

권장 명령:

```powershell
git switch codex/grid-integration-20260408
git merge --no-ff codex/detailcheckout_260402
```

## 10. 최종 통합 절차

모든 필요한 phase가 integration에 반영되었고 검증이 끝났다면, 마지막으로 원래 브랜치에 통합한다.

```powershell
git switch codex/detailcheckout_260402
git merge --no-ff codex/grid-integration-20260408
```

그 후 권장 검증:

```powershell
npm run typecheck
npm run build
```

필요하면 이후 원격 반영:

```powershell
git push origin codex/detailcheckout_260402
```

## 11. 빠른 체크리스트

### 시작 전

- `git status -sb` 확인
- 현재 브랜치 확인
- baseline 브랜치 생성 여부 확인

### phase 시작 전

- `grid-integration` 최신 상태 확인
- 이전 phase가 검증 후 병합되었는지 확인

### phase 종료 전

- `typecheck`
- `build`
- 브라우저 검증
- worklog 기록

### 최종 통합 전

- integration 브랜치에 필요한 phase가 모두 들어왔는지 확인
- 원래 브랜치 최신 변경이 integration에 반영되었는지 확인
- 최종 검증 완료 여부 확인

## 12. 권장 커밋/브랜치 관리 메모

- baseline 커밋은 WIP 성격이어도 괜찮다.
- phase 브랜치는 가능하면 한 phase당 1~3개 의미 있는 커밋으로 유지한다.
- 긴 실험은 integration에 바로 합치지 말고 spike 브랜치에서 끝낸다.
- interactive git 대신 `switch`, `merge --no-ff`, `log`, `status` 같은 비대화형 명령만 쓴다.

## 13. 실행 시작점 요약

지금 당장 실행을 시작한다면 아래 5줄이 첫 시작점이다.

```powershell
git branch --show-current
git status -sb
git switch -c codex/grid-baseline-20260408
git add -A
git commit -m "chore: checkpoint spreadsheet grid baseline 2026-04-08"
```

그 다음 바로 이어서:

```powershell
git switch -c codex/grid-integration-20260408
git switch -c codex/grid-p1-virtualization
```
