Req: Implement and verify Slice 397 provider execution package review coverage group summary generated-at chip.
Diff: Added a read-only generated-at chip for the provider execution package coverage group summary and updated `사용자 가이드.md`.
Why: Reviewers need to know which report snapshot timestamp backs the visible summary preview and local handoff actions.
Verify/Time: Passed 2026-05-14 10:58 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI generated-at chip validation on desktop/mobile.
