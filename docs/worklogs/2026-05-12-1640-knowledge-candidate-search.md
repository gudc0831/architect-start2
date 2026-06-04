Req: Implement and verify Slice 53 Knowledge candidate search.
Diff: Added client-side Knowledge candidate search across title, summary, project, task, and tags; updated user guide.
Why: Knowledge admins need a fast way to find WIKI candidates without changing server APIs.
Verify/Time: 2026-05-12 16:40-16:50 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified `Search candidates` renders and accepts `AS-001`, with only React DevTools/HMR/Fast Refresh console logs.
