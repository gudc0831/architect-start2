Req: Implement and verify Slice 419 provider execution package review coverage group summary reset confirmation copied-at chip.
Diff: Added a client-only reset-confirmation copied-at timestamp chip, set it on `Copy reset confirmation`, cleared it on `Reset summary status`, and updated the user guide.
Why: Reviewers need visible timing for the local reset-confirmation copy handoff without adding server/provider mutation.
Verify/Time: Passed 2026-05-14 13:39 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` validation, `npm run build`, and Playwright desktop/mobile Browser UI copied-at validation.
