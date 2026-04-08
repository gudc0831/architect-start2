# Spreadsheet Grid Phase 5 Canvas Decision Gate

- Date: 2026-04-08
- Scope: `daily` desktop grid
- Status: decision gate prepared, canvas implementation deferred

## Current Baseline

Phases 1-4 have shifted the daily desktop grid away from the worst full-table interaction path:

- Phase 1: desktop daily rows are viewport-windowed.
- Phase 2: inline editing is active-cell only.
- Phase 3: row interaction state is consumed through per-row subscriptions instead of row props.
- Phase 4: expensive list updates such as filter confirm, reorder result application, and view-mode switching use transition scheduling where safe.

The remaining question is whether the grid body should move from DOM cells to a canvas-backed renderer.

## Decision Rule

Stay on the current DOM + virtualization path unless at least one of these is true after Phases 1-4 are verified on realistic data:

1. Scroll or selection still drops frames noticeably on desktop with a few hundred rows.
2. Horizontal density grows beyond the current 15-column shape and DOM cell count becomes the dominant cost again.
3. Rich spreadsheet behaviors are required together:
   - frozen regions
   - large-range keyboard navigation
   - drag fill or multi-cell selection
   - very dense hover and selection painting
4. React and DOM optimization work starts producing mostly marginal gains while body rendering remains the bottleneck.

## Current Verdict

Do not move to canvas yet.

Reasons:

- The repo has not exhausted the DOM path after the Phase 3 and 4 changes.
- The current UX target is still row-centric editing, not full spreadsheet range editing.
- Canvas would raise implementation cost for accessibility, editor placement, hit-testing, and existing row-specific controls.

## What Must Be Measured Before Reopening Canvas

Collect these on `daily` desktop first:

1. Visible row count and mounted DOM row count at 200+ rows.
2. Selection latency while the detail panel is open.
3. Inline-cell activation latency on the active row.
4. Row-resize responsiveness during repeated interactions.
5. Paged/full-mode switch latency.

If those are acceptable after the current architecture changes, Phase 5 remains closed.

## If Canvas Reopens Later

Use a constrained spike instead of a direct migration:

1. Keep React for toolbar, filters, detail panel, and editor overlay.
2. Replace only the scrollable body with a canvas-backed surface.
3. Preserve row IDs and column keys as the source of truth.
4. Keep active editor UI in DOM overlays, not inside the canvas.
5. Validate keyboard navigation and accessibility before expanding scope.

## Next Trigger

Reopen this gate only after a measured regression or a stronger spreadsheet feature requirement appears.
