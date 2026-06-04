Req: Implement and verify Slice 394 provider execution package review coverage group summary download status chip.
Diff: Added a local read-only download status chip for the provider execution package coverage group summary and updated `사용자 가이드.md`.
Why: Reviewers need to distinguish a pending local summary download from a downloaded Markdown artifact without implying server archive persistence.
Verify/Time: Passed 2026-05-14 10:48 KST: `npm run typecheck`, `npm run lint`, `npx tsx -e "..."` service validation, `npm run build`, and Browser UI status-chip validation on desktop/mobile.
