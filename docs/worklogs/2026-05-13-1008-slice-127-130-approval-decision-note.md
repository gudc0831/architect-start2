Req: Implement Slices 127-130 for Knowledge approval decision note handoff.
Diff: Added approval decision note context chips, `Copy decision note`, blocker warning details, ready check details, risk group summary, and user guide notes.
Why: Admin approval/rejection handoff should preserve final decision context after grouped risk review without reassembling guardrail evidence manually.
Verify/Time: 2026-05-13 10:15 KST; `npm run typecheck`; `npm run lint` with 7 pre-existing task Hook warnings; `GET /api/admin/knowledge/candidates` 200; Playwright browser UI verified decision note context chips, copy decision note output, blocker warnings, ready checks, risk group summary, and mobile layout. Known unrelated `/api/project/changes` returned 500 during page load.
