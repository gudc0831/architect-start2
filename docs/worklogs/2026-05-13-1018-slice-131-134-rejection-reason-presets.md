Req: Implement Slices 131-134 for Knowledge rejection reason presets.
Diff: Added warning-derived rejection reason presets, preset application to the rejection reason draft, draft status chips, copy rejection reason action, and user guide notes.
Why: Approval blockers should translate into consistent rejection reason handoff text without requiring admins to manually retype guardrail details.
Verify/Time: 2026-05-13 10:24 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified rejection presets, preset application, draft status chips, copy rejection reason, and mobile layout. Known unrelated `/api/project/changes` returned 500 during page load.
