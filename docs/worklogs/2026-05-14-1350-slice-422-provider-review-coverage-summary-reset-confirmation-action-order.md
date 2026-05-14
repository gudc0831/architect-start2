Req: Implement and verify Slice 422 provider execution package review coverage group summary reset confirmation action order.
Diff: Moved `Copy reset confirmation` before `Reset summary status` in the local handoff action row and updated the user guide.
Why: Reviewers should be able to copy the current reset confirmation before creating a new local reset state.
Verify/Time: Passed 2026-05-14 13:50 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` validation, `npm run build`, and Playwright desktop/mobile Browser UI action order validation.
