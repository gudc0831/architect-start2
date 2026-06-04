Req: Implement Slices 123-126 for Knowledge approval risk detail guidance.
Diff: Added no-warning guidance, warning item previews, ready item previews, and detailed copy output for approval risk filter handoff; updated the user guide.
Why: Focused Knowledge approval review needs the filtered risk panel and copied handoff to explain the actual blocking and passing checks, not just counts.
Verify/Time: 2026-05-13 10:08 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified ready-category empty guidance, warning previews, ready previews, copy risk filter details, and mobile layout. Known unrelated `/api/project/changes` returned 500 during page load.
