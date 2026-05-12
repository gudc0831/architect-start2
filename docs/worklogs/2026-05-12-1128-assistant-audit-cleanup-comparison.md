Req: Implement and verify Slice 26 assistant audit cleanup dry-run comparison.
Diff: Added cleanup comparison API and JSON export, added Admin UI dry-run comparison controls/results/export, and documented the workflow in `사용자 가이드.md`.
Why: Admin reviewers need to compare a previous cleanup token with the current retention preview before running another cleanup, without deleting records.
Verify/Time: 2026-05-12 11:28 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; comparison API/export verified; Browser UI verified desktop/mobile comparison results.
