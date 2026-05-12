Req: Implement and verify Slice 25 assistant audit cleanup history reporting and export.
Diff: Added cleanup history API and CSV export, added Admin UI cleanup history filters/cards/export, and documented the workflow in `사용자 가이드.md`.
Why: Admin reviewers need a separate cleanup run history so deletion accountability is reviewable without mixing cleanup events into action/governance retention counts.
Verify/Time: 2026-05-12 11:17 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; cleanup history API/export verified; retention preview still reports 6 relevant action/governance events; Browser UI verified desktop/mobile cleanup history.
