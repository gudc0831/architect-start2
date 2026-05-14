Req: Implement and verify Slice 415 provider execution package review coverage group summary filename copy action.
Diff: Added a local `Copy filename` action for the provider execution package coverage group summary, added a copied filename status chip, reset that status with `Reset summary status`, and updated `사용자 가이드.md`.
Why: Reviewers need to copy only the visible summary Markdown filename for external handoff notes without copying the full Markdown summary or creating a server archive.
Verify/Time: Passed 2026-05-14 12:39 KST: `npm run typecheck`, `npm run lint` with 7 pre-existing task hook warnings, direct `getKnowledgeProviderExecutionPackageReviewNoteReport` filename validation, `npm run build`, Chrome CDP clipboard/download validation, and Chrome headless mobile DOM validation.
