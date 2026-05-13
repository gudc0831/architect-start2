Req: Implement Slices 110-113 for Knowledge publication scope review tools.
Diff: Added publication scope preview, organization-scope guardrail, scope-change guardrail, copy scope handoff, and user guide notes.
Why: Publication scope is a product data boundary, so reviewers need explicit audience checks before approving WIKI knowledge.
Verify/Time: 2026-05-13 09:41 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified scope preview, organization/restricted scope guardrails, scope changed/unchanged states, copy scope handoff, and mobile layout.
