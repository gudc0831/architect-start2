Req: Implement and verify Slice 416 provider execution package review coverage group summary reset explanation chip.
Diff: Added a read-only reset explanation chip for the provider execution package coverage group summary local status area and updated `사용자 가이드.md`.
Why: Reviewers need a persistent reminder that `Reset summary status` clears only local summary, filename, and download status, not server archives, provider writes, package evidence, or review notes.
Verify/Time: Passed 2026-05-14 12:46 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` filename validation, `npm run build`, Chrome CDP reset-flow validation, and Chrome headless mobile DOM validation.
