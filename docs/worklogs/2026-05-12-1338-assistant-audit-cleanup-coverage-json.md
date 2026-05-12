Req: Implement and verify Slice 33 assistant audit cleanup coverage JSON export.
Diff: Added cleanup review coverage JSON export API, added `Export coverage JSON` to the Admin cleanup note report, and documented the machine-readable export in `사용자 가이드.md`.
Why: Admin reviewers need read-only machine-readable coverage evidence with filters, summary counts, and coverage rows.
Verify/Time: 2026-05-12 13:38 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; coverage JSON API verified; Browser UI verified `Export coverage JSON` link.
