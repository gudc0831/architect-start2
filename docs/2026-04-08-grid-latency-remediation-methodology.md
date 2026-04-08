# Grid Latency Remediation Methodology

- Created: 2026-04-08
- Parent plan: [`2026-04-07-spreadsheet-grid-performance-plan.md`](/D:/architect%20-%20start2/docs/2026-04-07-spreadsheet-grid-performance-plan.md)
- Status: implemented follow-on remediation

## Why this addendum exists

The first spreadsheet-style grid pass removed the largest React rerender costs, but a follow-up review still found three latency-heavy paths:

1. Row height drag still wrote DOM on every `pointermove`.
2. Live row height during drag did not feed the virtualization window until `pointerup`.
3. Auto-fit cache existed, but cache misses still rebuilt a full measurement host on every run.

This addendum records the methodology used to close those gaps without regressing existing selection, resize, or inline editing behavior.

## Harness framing

- `product pass`: `proceed`
  - The user-facing goal stays the same: row height changes should feel as immediate as Google Sheets or Excel.
- `engineering pass`: `proceed with remediation`
  - The remaining bottleneck was no longer broad React rerender cost alone. It had narrowed to the resize hot path and cold measurement path.
- Ownership:
  - `choi`: coordinator, scope and integration
  - `hy`: worker, resize hot path and live window sync
  - `ung`: worker, auto-fit measurement optimization
  - `ch`: reviewer, browser UX confirmation
  - `ul`: reviewer, regression and rule compliance check

## Methodology

### 1. Keep the urgent path single-purpose

During row-height drag, the urgent path should do only three things:

1. compute the next height
2. update the active row shell height
3. update the virtualization snapshot used for visible-window math

Anything else, especially persistence or broad state fan-out, must stay out of the move loop.

### 2. Batch to the paint boundary, not the event boundary

`pointermove` can fire faster than the browser can paint. The remediation therefore moves drag application to `requestAnimationFrame` so the UI updates once per frame instead of once per DOM event.

Rule:

- `pointermove`: store the latest requested height
- `requestAnimationFrame`: apply the latest height once
- `pointerup`: flush the last pending value, then persist

### 3. Share one live height with both DOM and virtual window

The earlier implementation updated the active row DOM during drag but kept virtualization math on the persisted row-height map until release. That made the active row feel faster, but the viewport model still lagged behind.

Remediation rule:

- Keep persisted `rowHeights` as the durable source of truth.
- Add one transient `liveRowHeight` override to the layout snapshot.
- Resolve displayed row height as:
  - `liveRowHeight.height` for the active row during drag
  - persisted `rowHeights[taskId]` otherwise

This keeps the drag path lightweight while allowing spacer math and visible-window calculation to reflect the in-flight height.

### 4. Optimize cold measurement by reusing DOM

Auto-fit is allowed to do more work than drag, but it still cannot rebuild an entire hidden measurement host every time if spreadsheet-like responsiveness is the goal.

Remediation rule:

- Build row measurement presentations once per auto-fit request.
- Reuse a singleton hidden measurement host and per-column shell nodes.
- Replace only the content inside those shells.
- Keep cache invalidation explicit on column-width and taxonomy-definition changes.

This removes repeated host creation and destruction from the cold path while preserving accurate DOM-based measurement.

### 5. Validate user-perceived speed, not only code structure

Implementation is not accepted unless browser behavior confirms the intended feel.

Required checks:

1. Drag row height and confirm only the active row grows in-flight.
2. Confirm neighboring visible rows do not jump during the drag.
3. Confirm selection can still be cleared by clicking background text or empty workspace area.
4. Confirm detail panel selection state tracks the cleared selection correctly.
5. Confirm there are no new console errors.

## Applied implementation

Primary file:

- [`task-workspace.tsx`](/D:/architect%20-%20start2/src/components/tasks/task-workspace.tsx)

Applied changes:

1. Added `requestAnimationFrame` scheduling for row-height drag moves.
2. Added transient `liveRowHeight` to the layout store snapshot.
3. Updated virtual window height resolution to use the live override during drag.
4. Cleared transient live height on commit, layout restore, and non-virtualized fallback.
5. Reworked auto-fit to build measurement cells once and reuse a persistent measurement host.

## What this method explicitly avoids

1. It does not reintroduce parent-wide React state writes on drag.
2. It does not switch the grid body to canvas yet.
3. It does not change task persistence timing; persistence still happens after the interaction, not during it.
4. It does not change task edit typography or blank-space deselection behavior beyond regression-safe verification.

## Verification standard

Code-level:

- `npm run typecheck`
- `npm run build`

Browser-level:

- `preview/daily`
- drag active row `task-101`
- confirm in-flight height change on `task-101` while `task-102` remains stable
- confirm background click clears selection
- confirm detail panel heading returns to `선택된 작업 없음`
- confirm console errors remain `0`

## Residual risks

1. `DailyTaskTableBody` still rebuilds its visible window snapshot when viewport or live row height changes. That is acceptable for now, but future profiling may still justify selector-level layout subscriptions.
2. Auto-fit still depends on DOM measurement. The path is cheaper now, not free.
3. If future work adds multiple simultaneous row-resize interactions, the single `liveRowHeight` override should be generalized to a transient map.

## Resume checklist

If responsiveness still feels behind target in a later session, resume in this order:

1. Capture a React Profiler trace around row-height drag on `preview/daily`.
2. Measure 200+ row behavior with the same drag path.
3. Split layout snapshot subscriptions further only if the body recomputation itself becomes the bottleneck.
4. Reopen the existing canvas decision gate only after the current DOM path is measured and shown insufficient.
