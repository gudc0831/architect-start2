Req: Implement and verify Slice 35 assistant audit cleanup reviewer rollup package export.
Diff: Added cleanup coverage Markdown rollup package export, added `Export rollup package` to the Admin cleanup note report, and documented the governance package in `사용자 가이드.md`.
Why: Admin reviewers need a readable monthly evidence package with reviewer/category counts, stale status, and cleanup coverage rows.
Verify/Time: 2026-05-12 14:05 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; rollup Markdown API verified; Browser UI verified `Export rollup package` link.
