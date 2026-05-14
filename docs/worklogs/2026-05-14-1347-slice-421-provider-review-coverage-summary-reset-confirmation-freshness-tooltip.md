Req: Implement and verify Slice 421 provider execution package review coverage group summary reset confirmation freshness tooltip.
Diff: Added a static title tooltip for the reset-confirmation freshness chip and updated the user guide.
Why: Reviewers need compact accessible context for pending, refresh-needed, and current freshness states without adding visible panel copy.
Verify/Time: Passed 2026-05-14 13:47 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` validation, `npm run build`, and Playwright desktop/mobile Browser UI tooltip validation.
