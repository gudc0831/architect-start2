Req: Implement and verify Slice 30 assistant audit cleanup review-note summary metrics.
Diff: Added cleanup review-note summary API, added read-only summary metrics to the Admin cleanup note report, and documented the reconciled summary workflow in `사용자 가이드.md`.
Why: Admin reviewers need quick category/reviewer distribution and reviewed/unreviewed cleanup-run coverage without exporting CSV first.
Verify/Time: 2026-05-12 12:42 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; summary API verified; Browser UI verified summary metrics and report reconciliation.
