Req: Implement Slices 115-118 for Knowledge approval risk summary.
Diff: Added grouped approval risk summary chips, risk group detail cards, copy risk summary action, risk group count chip, and user guide notes.
Why: Accumulated guardrails need category-level triage so reviewers can prioritize scope, metadata, structure, evidence, and state risks.
Verify/Time: 2026-05-13 09:47 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified risk summary chips, risk group detail cards, copy risk summary, risk group count chip, and mobile layout.
