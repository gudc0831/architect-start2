Req: Implement Slice 381 provider execution package review filter reset chips.
Diff: Added Admin Knowledge reset chips for provider execution package review digest, note-category, reviewer, and all shortcut filters. Updated `사용자 가이드.md`.
Why: Reviewers need a visible way to clear shortcut-applied review filters without manually editing each controlled filter field.
Verify/Time: Passed `npm run typecheck`, `npm run lint` with existing task hook warnings, direct review-report service validation, `npm run build`, and Browser UI validation for desktop reset chips plus mobile reset-chip rendering | 2026-05-13 22:45 KST
