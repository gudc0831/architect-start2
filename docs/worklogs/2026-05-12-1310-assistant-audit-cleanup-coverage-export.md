Req: Implement and verify Slice 31 assistant audit cleanup reviewed/unreviewed coverage CSV export.
Diff: Added cleanup review coverage CSV export API, added `Export coverage CSV` to the Admin cleanup note report, and documented the coverage export in `사용자 가이드.md`.
Why: Admin reviewers need a monthly export of cleanup runs with reviewed/unreviewed note coverage status for governance review.
Verify/Time: 2026-05-12 13:10 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; coverage CSV API verified; Browser UI verified `Export coverage CSV` link.
