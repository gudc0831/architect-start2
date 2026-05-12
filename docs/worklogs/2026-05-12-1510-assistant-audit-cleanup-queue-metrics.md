Req: Implement and verify Slice 47 assistant audit cleanup queue metrics.
Diff: Added run, note, deleted, and skipped totals to each cleanup governance queue group; updated user guide.
Why: Reviewers need queue-level totals to compare cleanup evidence volume before opening individual cleanup runs.
Verify/Time: 2026-05-12 15:10-15:20 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified `Runs`, `Notes`, `Deleted`, and `Skipped` queue metrics render, with only React DevTools/HMR/Fast Refresh console logs.
