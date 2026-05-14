Req: Implement and verify Slice 402 provider execution package review coverage group summary stale priority chip.
Diff: Added a read-only stale priority chip for provider execution package coverage group totals and updated `사용자 가이드.md`.
Why: Reviewers need a compact stale-priority signal that combines stale unreviewed count with the active stale-day threshold.
Verify/Time: Passed 2026-05-14 11:16 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI stale priority chip validation on desktop/mobile.
