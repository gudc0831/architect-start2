Req: Implement Slices 119-122 for Knowledge approval risk filter shortcuts.
Diff: Added risk group shortcut filters, active risk filter chips, clear risk group action, copy risk filter handoff, and user guide notes.
Why: Grouped approval risk review needs focused category triage and handoff without changing underlying guardrails.
Verify/Time: 2026-05-13 09:54 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified risk filter shortcuts, active filter chips, clear filter, copy risk filter, and mobile layout.
