Req: Implement and verify Slice 417 provider execution package review coverage group summary reset confirmation chip.
Diff: Added a client-only local reset confirmation timestamp chip for provider execution package coverage group summary and updated the user guide.
Why: Reviewers need visible confirmation that `Reset summary status` ran locally without implying server/provider mutation.
Verify/Time: Passed 2026-05-14 12:52 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` validation, `npm run build`, Chrome CDP reset-confirmation validation, and mobile DOM validation.
