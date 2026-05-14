Req: Implement and verify Slice 395 provider execution package review coverage group summary copy status chip.
Diff: Added a local read-only copy status chip for the provider execution package coverage group summary and updated `사용자 가이드.md`.
Why: Reviewers need visible confirmation that the compact grouped coverage summary has been copied for handoff without relying only on transient page status text.
Verify/Time: Passed 2026-05-14 10:52 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI copy-status validation on desktop/mobile.
