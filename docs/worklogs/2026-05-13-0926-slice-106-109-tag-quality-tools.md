Req: Implement Slices 106-109 for Knowledge draft tag quality tools.
Diff: Added tag coverage and duplicate-tag approval guardrails, draft tag preview chips, copy draft tag handoff, and user guide notes.
Why: Tags support retrieval and WIKI grouping, so reviewers need visible tag quality checks before approval.
Verify/Time: 2026-05-13 09:31 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified tag coverage, duplicate-tag guardrails, tag preview, copy draft tags, and mobile layout.
