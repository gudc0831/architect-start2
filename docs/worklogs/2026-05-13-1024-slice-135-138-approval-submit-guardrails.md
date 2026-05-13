Req: Implement Slices 135-138 for Knowledge approval submit guardrails.
Diff: Added final approval blocker count chips, caution/ready guidance, copy approval blockers action, approval button warning context, and user guide notes.
Why: Final WIKI approval actions should surface unresolved blockers and provide a copyable blocker handoff before submission.
Verify/Time: 2026-05-13 10:31 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified submit blocker chips, caution guidance, copy approval blockers, approval button warning context, and mobile layout. Known unrelated `/api/project/changes` returned 500 during page load.
