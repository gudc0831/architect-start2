Req: Implement and verify Slice 400 provider execution package review coverage group summary empty queue count chip.
Diff: Added a read-only empty queue count chip for provider execution package coverage groups and updated `사용자 가이드.md`.
Why: Reviewers need a compact signal for how many coverage queues are empty under active filters before scanning grouped rows.
Verify/Time: Passed 2026-05-14 11:09 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI empty queue count chip validation on desktop/mobile.
