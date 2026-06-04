Req: Implement and verify Slice 32 assistant audit cleanup coverage dashboard.
Diff: Added cleanup review coverage JSON API, added read-only coverage cards to the Admin cleanup note report, and documented the dashboard in `사용자 가이드.md`.
Why: Admin reviewers need to inspect reviewed/unreviewed cleanup coverage on screen without downloading CSV first.
Verify/Time: 2026-05-12 13:24 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; coverage JSON API verified; Browser UI verified coverage dashboard cards.
