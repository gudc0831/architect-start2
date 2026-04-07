Req: Document a resumable branch workflow with exact command order so the spreadsheet-grid performance work can start from the current point-in-time snapshot and continue later safely.
Diff: Added `docs/2026-04-07-spreadsheet-grid-branch-operations.md`, linked it from the spreadsheet performance plan, and recorded the branch topology, command order, resume path, and integration rules.
Why: The grid-performance work will touch the same core files across multiple phases, so a self-contained branch-operations guide reduces merge risk and makes it possible to resume later without rebuilding context.
Verify: Re-checked current branch and dirty worktree state locally, then confirmed the new document and cross-link are present.
