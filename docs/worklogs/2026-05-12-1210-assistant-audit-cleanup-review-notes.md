Req: Implement and verify Slice 28 assistant audit cleanup review notes.
Diff: Added cleanup review-note creation API, surfaced append-only cleanup notes in Admin cleanup detail, included notes in Markdown cleanup packages, and documented the workflow in `사용자 가이드.md`.
Why: Admin reviewers need post-cleanup governance context without mutating the original cleanup audit metadata or retention cleanup eligibility.
Verify/Time: 2026-05-12 12:10 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; note/detail/package/retention API verified; Browser UI verified desktop/mobile cleanup note save and display.
