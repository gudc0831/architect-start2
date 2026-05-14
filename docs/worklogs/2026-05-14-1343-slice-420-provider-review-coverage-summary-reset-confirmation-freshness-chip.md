Req: Implement and verify Slice 420 provider execution package review coverage group summary reset confirmation freshness chip.
Diff: Added a client-only reset-confirmation copy freshness chip derived from local reset and copied-at state, and updated the user guide.
Why: Reviewers need to know whether the latest local reset confirmation still needs a fresh copy handoff.
Verify/Time: Passed 2026-05-14 13:43 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` validation, `npm run build`, and Playwright desktop/mobile Browser UI freshness validation.
