Req: Implement Slices 151-200 approved Knowledge WIKI readback from the planning flow.
Diff: Added approved WIKI list/search/filter/sort/detail/quality/source/Markdown preview/copy-package UI in `/admin/knowledge` and updated `사용자 가이드.md`.
Why: Approved WIKI entries needed post-approval inspection and reuse handoff without adding a second source of truth beyond `/api/admin/knowledge/items`.
Verify/Time: typecheck pass; lint pass with 7 pre-existing task Hook warnings; candidates/items APIs 200; Playwright UI readback/search/clear verified | 2026-05-13 11:25
