Req: Implement and verify Slice 403 provider execution package review coverage group summary local-only handoff chip.
Diff: Added a read-only local-only handoff chip for provider execution package coverage group summary copy/download actions and updated `사용자 가이드.md`.
Why: Reviewers need a persistent reminder that summary copy/download handoff is local-only and does not create a server archive.
Verify/Time: Passed 2026-05-14 11:20 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI local-only handoff chip validation on desktop/mobile.
