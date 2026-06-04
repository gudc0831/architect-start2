Req: Implement and verify Slice 418 provider execution package review coverage group summary reset confirmation copy handoff.
Diff: Added a local `Copy reset confirmation` action, reset-confirmation copy status chip, stale copy-status clearing on reset, and updated the user guide.
Why: Reviewers need to copy the exact local reset confirmation text into handoff notes without implying server/provider mutation.
Verify/Time: Passed 2026-05-14 13:34 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` validation, `npm run build`, and Playwright desktop/mobile Browser UI validation with clipboard checks.
