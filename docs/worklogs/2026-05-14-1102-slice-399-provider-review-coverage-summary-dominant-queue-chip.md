Req: Implement and verify Slice 399 provider execution package review coverage group summary dominant queue chip.
Diff: Added a read-only dominant queue chip for provider execution package coverage groups and updated `사용자 가이드.md`.
Why: Reviewers need a compact signal for which coverage queue currently dominates the visible package set before scanning grouped rows.
Verify/Time: Passed 2026-05-14 11:05 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI dominant queue chip validation on desktop/mobile.
