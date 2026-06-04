Req: Implement and verify Slice 27 assistant audit cleanup detail drill-down and package export.
Diff: Added cleanup detail and Markdown package APIs, added Admin UI review/export actions with raw metadata detail panel, and documented the workflow in `사용자 가이드.md`.
Why: Admin reviewers need durable per-cleanup evidence even after source action/governance audit events are deleted.
Verify/Time: 2026-05-12 11:46 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; detail/package APIs verified; Browser UI verified desktop/mobile cleanup detail.
