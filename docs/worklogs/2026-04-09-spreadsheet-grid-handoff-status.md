# Spreadsheet Grid Handoff Status

- Date: 2026-04-09
- Branch at write time: `codex/detailcheckout_260402`
- Current HEAD at write time: `52c5be6`
- Main reference plan: [`2026-04-07-spreadsheet-grid-performance-plan.md`](/D:/architect%20-%20start2/docs/2026-04-07-spreadsheet-grid-performance-plan.md)
- Follow-on method note: [`2026-04-08-grid-latency-remediation-methodology.md`](/D:/architect%20-%20start2/docs/2026-04-08-grid-latency-remediation-methodology.md)

## Purpose of this file

This is the single handoff file for the spreadsheet-style daily grid performance work.

It is meant to answer all of the following without requiring a future worker to reconstruct the history from chat:

1. What the original plan was trying to achieve
2. What was actually implemented
3. What was intentionally not implemented
4. What is still incomplete or only partially verified
5. Why each decision was made
6. Which files and worklogs matter
7. What the current uncommitted state is
8. Where to resume next

## Original user goal

The user wanted the daily grid, especially row-height resizing, to feel closer to Google Sheets / Excel:

- each row should react quickly on its own
- full-screen lag during row-height changes should be avoided
- existing behavior must not regress
- editing should stay visually consistent with viewer mode
- blank-space deselection and previously working interactions must keep working

## High-level execution history

The work proceeded in these broad steps.

### 1. Architecture investigation

I first reviewed the current daily grid and compared it against public spreadsheet/grid performance patterns.

Conclusion:

- the main bottleneck was not pre-deploy state alone
- the stronger bottleneck was dense client-side rendering and hot-path interaction work inside the current daily grid
- a Sheets-like feel required:
  - bounded DOM
  - lighter edit rendering
  - externalized grid state
  - interaction scheduling
  - optionally, a canvas decision gate later

Related log:

- [`2026-04-07-daily-grid-performance-architecture-research.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-07-daily-grid-performance-architecture-research.md)

### 2. Multi-phase plan creation

I wrote the detailed future plan document that defined the 1~5 phase roadmap:

1. row virtualization
2. display/editor separation
3. granular external store
4. scheduling and measurement budget control
5. canvas decision gate

Related files:

- [`2026-04-07-spreadsheet-grid-performance-plan.md`](/D:/architect%20-%20start2/docs/2026-04-07-spreadsheet-grid-performance-plan.md)
- [`PLAN.md`](/D:/architect%20-%20start2/PLAN.md)
- [`2026-04-07-spreadsheet-grid-performance-plan-docs.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-07-spreadsheet-grid-performance-plan-docs.md)

### 3. Branch operation planning and integration strategy

I also documented how to branch, phase, and integrate this work safely. That branch strategy was later used and merged back into the main working branch.

Related logs:

- [`2026-04-07-spreadsheet-grid-branch-operations-docs.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-07-spreadsheet-grid-branch-operations-docs.md)
- [`2026-04-08-spreadsheet-grid-branch-bootstrap.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-spreadsheet-grid-branch-bootstrap.md)

### 4. Phase implementation work

I then implemented the plan in several passes:

- Phase 1 virtualization
- active-cell-only editing
- external layout and interaction stores
- scheduling and measurement improvements
- regression fixes
- row-latency remediation follow-up

These changes were integrated and merged into the current branch history.

## What was implemented

This section is the most important one for a future worker.

### Implemented: Phase 1 core viewport virtualization

Status: `implemented`

What was done:

- desktop `daily` table body was virtualized
- visible rows were bounded by viewport and overscan instead of full mount
- selected row / editing row / pending focus row were pinned to stay mounted when needed
- spacer rows were introduced to keep scroll geometry stable

Why it was done:

- this was the largest architectural win available without fully rewriting the grid
- it reduced mounted row count and made later optimizations meaningful

Where it lives:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

Evidence:

- [`2026-04-08-daily-grid-phase1-virtualization.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-daily-grid-phase1-virtualization.md)

### Implemented: active-cell editing instead of “whole selected row becomes editor”

Status: `implemented`

What was done:

- selected rows no longer open multiple editors at once
- only the active inline edit cell renders the editor
- the rest of the row remains display-oriented and can still reflect draft values

Why it was done:

- even after virtualization, opening many editors at once kept too much DOM and interaction cost alive
- spreadsheet-like behavior is closer to “one active cell editor” than “whole row edit mode”

Where it lives:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

Evidence:

- [`2026-04-08-daily-grid-active-cell-edit.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-daily-grid-active-cell-edit.md)

### Implemented: overlay editor rendering

Status: `implemented`

What was done:

- the active inline editor is rendered through an overlay path instead of staying as normal in-cell DOM only
- the viewer content under the active cell can be hidden while the overlay is active
- title editor typography was aligned back to viewer typography

Why it was done:

- lighter display cells are easier to keep fast
- overlay editing is a better fit for virtualization and spreadsheet-like behavior
- edit state had visually drifted from viewer typography and needed regression-safe correction

Where it lives:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)
- [`globals.css`](/D:/architect%20-%20start2/src/app/globals.css)

Evidence:

- overlay behavior exists in code via `TaskListInlineEditorOverlay`
- regression fix log: [`2026-04-08-daily-grid-regression-fixes.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-daily-grid-regression-fixes.md)

### Implemented: external layout store and row interaction store

Status: `implemented`

What was done:

- layout state was moved into an external store:
  - row heights
  - viewport snapshot
- interaction state was moved into an external store:
  - selected row
  - active inline edit cell
  - drop state
  - focused-task dimming state
- the code uses `useSyncExternalStore`

Why it was done:

- to reduce parent-wide React rerenders on hot paths
- to let row-level subscriptions carry more of the fan-out cost

Where it lives:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

Evidence:

- [`2026-04-08-daily-grid-phase3-4-phase5-gate.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-daily-grid-phase3-4-phase5-gate.md)

### Implemented: non-urgent scheduling for some heavier UI updates

Status: `implemented`

What was done:

- `startTransition` is used for some non-urgent updates such as view mode changes and reorder-related follow-up updates
- `useDeferredValue` is used for focus-strip derivation

Why it was done:

- not all UI state changes deserve urgent rendering priority
- some derivations can be softened without hurting direct manipulation

Where it lives:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

### Implemented: auto-fit cache with invalidation

Status: `implemented`

What was done:

- row auto-fit results are cached
- the cache is cleared when:
  - column widths change
  - work type definitions change
  - category definitions change

Why it was done:

- repeated auto-fit without caching would repeatedly pay full measurement cost

Where it lives:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

### Implemented: row-height drag fast path

Status: `implemented`

What was done before the final remediation:

- row resize updated only the active row DOM during drag
- persisted state and layout save happened after drag end

Why it mattered:

- this was the first major reduction in drag-time React cost

### Implemented later: row-height latency remediation

Status: `implemented in working tree, not yet committed at time of writing`

This is important.

There is a later follow-up pass in the current working tree that goes beyond the earlier merged work:

1. row resize is now batched to `requestAnimationFrame`
2. a transient `liveRowHeight` was added to the layout store snapshot
3. virtualization window math can now follow the in-flight row height during drag
4. auto-fit measurement reuses a persistent hidden measurement DOM instead of rebuilding the host every time

Why this follow-up was necessary:

- the earlier phase still left:
  - pointermove-rate DOM writes
  - stale virtualization math during drag
  - avoidable DOM churn on auto-fit cache miss

Where it lives:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)
- [`2026-04-08-grid-latency-remediation-methodology.md`](/D:/architect%20-%20start2/docs/2026-04-08-grid-latency-remediation-methodology.md)
- [`2026-04-08-grid-latency-remediation.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-grid-latency-remediation.md)

Important current-state note:

- this remediation exists in the current working tree
- it is not yet committed at the time this handoff file is being written

### Implemented: regression fixes requested during the process

Status: `implemented`

What was fixed:

- blank-space click deselection
- detail panel reset after deselection
- edit typography should match viewer typography
- overlay-hidden viewer content behavior
- drag handle availability regression

Why it was done:

- the user explicitly required that old working behavior must not regress
- some performance-oriented changes temporarily broke or altered previous behavior

Where it lives:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)
- [`globals.css`](/D:/architect%20-%20start2/src/app/globals.css)

Evidence:

- [`2026-04-08-daily-grid-regression-fixes.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-daily-grid-regression-fixes.md)

### Implemented: Phase 5 as a decision gate, not a canvas migration

Status: `implemented as documentation / not implemented as code`

What was done:

- the codebase did not move to canvas
- instead, a Phase 5 canvas decision gate was documented

Why it was done:

- the plan itself positioned canvas as a later decision, not an automatic step
- moving to canvas would have sharply increased complexity, accessibility cost, IME/editing complexity, and regression risk
- the safer path was to first exhaust the DOM-based improvements

Evidence:

- [`2026-04-08-daily-grid-phase3-4-phase5-gate.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-daily-grid-phase3-4-phase5-gate.md)

## What was not implemented, or only partially implemented

This section matters because the plan document is more ambitious than the actual code changes.

### Not implemented: full `@tanstack/react-virtual` or dedicated grid module split

Status: `not implemented`

The plan discussed introducing a dedicated virtualization library and potentially splitting the grid into:

- `task-grid-viewport.tsx`
- `task-grid-row.tsx`
- `task-grid-header.tsx`

What actually happened:

- virtualization was implemented inside the existing `task-workspace.tsx`
- the code remained inside the current table-based architecture
- the repo did not adopt `@tanstack/react-virtual`

Why this was not done:

- minimizing regression risk was prioritized
- the existing screen already had many behaviors coupled into `TaskWorkspace`
- a lower-risk in-place virtualization pass was faster to ship and easier to validate

### Not implemented: full conversion from `<table>` to `div role=\"grid\"` shell

Status: `not implemented`

What actually happened:

- the desktop daily body was virtualized
- but the surface remains fundamentally table-based

Why this was not done:

- a full semantic/layout shell conversion would have been much more invasive
- sticky header behavior, width sync, overlay position math, and regressions would all have become riskier at once
- the user’s immediate pain was resize latency, so it was better to target hot paths first

### Not implemented: spreadsheet-style keyboard cell navigation

Status: `not implemented`

What actually happened:

- active-cell editing exists
- but Excel/Sheets-style cell-to-cell keyboard navigation was not built

Why this was not done:

- it was outside the performance-critical path the user focused on
- it would have added interaction complexity while the main task was still to remove lag and preserve existing behavior

### Not implemented: canvas-backed grid body

Status: `not implemented by design`

Why:

- Phase 5 was always a gate, not an automatic destination
- current work focused on extracting the maximum safe performance from the DOM-based approach first

### Partially implemented: granular subscriptions

Status: `partially implemented`

What is done:

- there are external stores
- row interaction state is more granular
- layout state is externalized

What is still not ideal:

- `DailyTaskTableBody` still recomputes its visible window snapshot whenever the layout snapshot changes
- the current latency remediation adds `liveRowHeight`, but body-level recomputation still exists

Why it was left this way:

- this was an acceptable tradeoff versus wider refactoring
- it is measurably safer than reintroducing parent-wide React state churn
- additional selector-level layout subscriptions should only be added if profiler data shows this body recomputation is still the dominant bottleneck

### Partially implemented: large-data quantitative verification

Status: `partially implemented`

What was verified:

- `preview/daily`
- `daily`
- row resize behavior
- active-cell edit behavior
- deselection
- detail panel reset
- drag handle presence
- no console errors in the verified flows
- `npm run typecheck`
- `npm run build`

What was not fully proven:

- no committed quantitative 200+/500 row profiler artifact was left in the repo
- synthetic `pointerup` validation was not a perfect substitute for every real storage-commit scenario
- drag reorder end-to-end mutation was intentionally handled conservatively in automation

Why this remains partial:

- the main focus was safe implementation and user-visible responsiveness
- browser automation was used for practical signoff, not exhaustive profiling infrastructure

### Partially implemented: auto-fit optimization

Status: `partially implemented`

What is done:

- caching exists
- invalidation exists
- latest remediation reuses measurement DOM

What is still true:

- auto-fit still depends on DOM measurement
- it is cheaper now, but not free

Why this remains partial:

- accurate content-height measurement still requires the browser layout engine
- switching to an approximate or non-DOM measurement path would risk wrong row heights

## File-level summary

### Core code file touched repeatedly

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

This file contains most of the spreadsheet-grid work:

- virtualization windowing
- row rendering
- active-cell editing
- overlay editor
- layout store
- interaction store
- row resize
- auto-fit measurement
- regression fixes
- latest latency remediation

### Styling file touched for overlay/editor regressions

- [`globals.css`](/D:/architect%20-%20start2/src/app/globals.css)

### Planning and handoff docs

- [`2026-04-07-spreadsheet-grid-performance-plan.md`](/D:/architect%20-%20start2/docs/2026-04-07-spreadsheet-grid-performance-plan.md)
- [`2026-04-08-grid-latency-remediation-methodology.md`](/D:/architect%20-%20start2/docs/2026-04-08-grid-latency-remediation-methodology.md)
- this file: [`2026-04-09-spreadsheet-grid-handoff-status.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-09-spreadsheet-grid-handoff-status.md)

## Verification history

### Repeated code-level verification used during this work

- `npm run typecheck`
- `npm run build`

These were run multiple times across the implementation passes and again for the latest latency remediation.

### Browser verification that was explicitly performed

Across the worklogs, the following were confirmed in browser QA:

- virtualization mounts visible rows plus spacer rows
- selected row can remain mounted when scrolled
- active cell editor count drops to 1 instead of many per selected row
- background click can clear selection
- detail heading returns to `선택된 작업 없음`
- title editor typography matches viewer state
- drag handles exist and are enabled
- row resize can update from roughly `52px` to larger values during interaction
- in latest remediation, `task-101` grew in-flight while adjacent `task-102` stayed stable
- console errors remained `0` in checked flows

## Current git state at the time of writing

At the time this file was written, the working tree state was:

- modified:
  - [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)
- untracked:
  - [`2026-04-08-grid-latency-remediation-methodology.md`](/D:/architect%20-%20start2/docs/2026-04-08-grid-latency-remediation-methodology.md)
  - [`2026-04-08-grid-latency-remediation.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-grid-latency-remediation.md)
  - this file after creation

Interpretation:

- earlier spreadsheet-grid work is already in branch history
- the newest latency-remediation follow-up is still uncommitted and exists only in the working tree right now

## Why the current state looks like this

The branch already contains the earlier spreadsheet-grid phases because they were merged and integrated previously.

The current working-tree delta exists because a later review found that the row-height latency plan was still not fully satisfied:

- row resize used event-rate DOM writes
- virtualization did not see live height until pointer-up
- auto-fit cache misses still recreated measurement DOM

So the latest pass was intentionally a focused follow-up rather than another broad architectural rewrite.

## Recommended next action for the next worker

If you are picking this up next, do this in order:

1. Read this file first.
2. Read [`2026-04-08-grid-latency-remediation-methodology.md`](/D:/architect%20-%20start2/docs/2026-04-08-grid-latency-remediation-methodology.md).
3. Inspect the current diff in [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx).
4. Re-run:
   - `npm run typecheck`
   - `npm run build`
5. Re-check in browser:
   - `preview/daily`
   - row-height drag on `task-101`
   - adjacent row stability
   - blank-space deselect
   - detail heading reset
   - console errors
6. If all of that passes, commit the current latency-remediation changes together with:
   - [`2026-04-08-grid-latency-remediation-methodology.md`](/D:/architect%20-%20start2/docs/2026-04-08-grid-latency-remediation-methodology.md)
   - [`2026-04-08-grid-latency-remediation.md`](/D:/architect%20-%20start2/docs/worklogs/2026-04-08-grid-latency-remediation.md)
   - this handoff file

## If more performance work is needed after that

Only move further if the user still feels visible lag after the current uncommitted remediation is validated and committed.

Recommended order:

1. collect React Profiler evidence on `preview/daily`
2. validate 200+ row behavior more explicitly
3. decide whether body-level layout snapshot recomputation is still too expensive
4. only then consider deeper selector-level store splitting
5. reopen the Phase 5 canvas gate only if the DOM path is shown insufficient

## Final status summary

Short version:

- the spreadsheet-grid plan was implemented substantially, not literally line-by-line
- the major user-visible goals were addressed:
  - bounded DOM
  - active-cell editing
  - external stores
  - scheduling improvements
  - regression fixes
  - additional row-latency remediation
- some plan items remain intentionally partial:
  - no full grid shell rewrite
  - no virtualization library adoption
  - no canvas body
  - no spreadsheet keyboard navigation
  - no exhaustive large-data profiling artifact in repo
- the single most important current fact is:
  - the latest row-latency remediation is in the working tree and still needs to be committed after final validation
