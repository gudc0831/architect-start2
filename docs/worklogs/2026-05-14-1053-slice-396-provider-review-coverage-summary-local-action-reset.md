Req: Implement and verify Slice 396 provider execution package review coverage group summary local action reset.
Diff: Added `Reset summary status` for the local provider execution package coverage group summary copy/download chips and updated `사용자 가이드.md`.
Why: Reviewers need to clear local handoff status between checks without changing coverage filters, provider packages, or review notes.
Verify/Time: Passed 2026-05-14 10:55 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI reset validation on desktop/mobile.
