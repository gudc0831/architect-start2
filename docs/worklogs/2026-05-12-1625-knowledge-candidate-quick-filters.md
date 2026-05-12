Req: Implement and verify Slice 52 Knowledge candidate quick filters.
Diff: Added quick filter buttons for candidate, approved, rejected, and all Knowledge candidate states; updated user guide.
Why: Knowledge admins need fast state switching without opening the candidate-state select.
Verify/Time: 2026-05-12 16:25-16:35 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified quick filters render and clicking the localized approved quick filter sets the state select to `approved`, with only React DevTools/HMR/Fast Refresh console logs.
