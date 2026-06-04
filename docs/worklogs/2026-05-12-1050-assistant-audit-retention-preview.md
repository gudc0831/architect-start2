Req: Implement and verify Slice 23 assistant audit retention and archive preview controls.
Diff: Added read-only retention preview and JSON archive preview APIs, added Admin UI retention preview with policy/cutoff/monthly counts/export, and documented the workflow in `사용자 가이드.md`.
Why: Admin reviewers need to see retention impact and export preserved audit/note evidence before any destructive assistant audit cleanup is allowed.
Verify/Time: 2026-05-12 10:50 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; retention preview/export APIs returned eligible counts and preserved metadata; Playwright verified `/admin/assistant` retention preview, export URL, and desktop/mobile layout.
