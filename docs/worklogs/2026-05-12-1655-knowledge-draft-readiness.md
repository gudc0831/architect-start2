Req: Implement and verify Slice 54 Knowledge draft readiness checklist.
Diff: Added read-only readiness chips for title, summary, body, tags, and evidence in the Knowledge WIKI draft editor; updated user guide.
Why: Knowledge admins need to see whether required WIKI draft inputs are present before approval review.
Verify/Time: 2026-05-12 16:55-17:05 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified Ready Title/Summary/Body/Tags/Evidence chips render, with only React DevTools/HMR/Fast Refresh console logs.
