Req: Implement and verify Slice 46 assistant audit cleanup governance queue grouping.
Diff: Grouped cleanup coverage rows into stale unreviewed, other unreviewed, and reviewed evidence queues; updated user guide.
Why: Monthly cleanup governance review needs a queue view that separates urgent unreviewed runs from already reviewed evidence without changing cleanup metadata.
Verify/Time: 2026-05-12 14:50-15:05 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); API checked `/api/admin/assistant/cleanup-review-notes/coverage?month=2026-05&coveragePreset=all&staleDays=7`; Browser UI verified all three cleanup queue group headings render, with only React DevTools/HMR/Fast Refresh console logs.
