Req: Implement and verify Slice 423 provider execution package review coverage summary local handoff action group label.
Diff: Split local handoff actions from queue density controls, added an accessible group label, and updated the user guide.
Why: Browser accessibility tooling and keyboard review should distinguish density controls from summary copy/download and reset-confirmation handoff actions.
Verify/Time: Passed 2026-05-14 13:53 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` validation, `npm run build`, and Playwright desktop/mobile Browser UI action group validation.
