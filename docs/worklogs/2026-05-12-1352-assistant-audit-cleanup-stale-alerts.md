Req: Implement and verify Slice 34 assistant audit cleanup stale review alerts.
Diff: Added stale-threshold support to cleanup review summary/coverage APIs and exports, added `Stale days` and stale alert metrics/cards to Admin UI, and documented the read-only alert workflow in `사용자 가이드.md`.
Why: Admin reviewers need to identify unreviewed cleanup runs that have aged beyond a governance threshold without mutating cleanup metadata.
Verify/Time: 2026-05-12 13:52 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; stale summary/coverage/export APIs verified; Browser UI verified stale controls and metric.
