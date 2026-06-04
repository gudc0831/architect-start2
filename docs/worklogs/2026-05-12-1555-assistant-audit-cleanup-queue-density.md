Req: Implement and verify Slice 50 assistant audit cleanup queue density controls.
Diff: Added `Compact queue`/`Detailed queue` toggle that hides secondary cleanup row details while keeping row actions and chips visible; updated user guide.
Why: Monthly cleanup reviewers need a denser queue view for scanning long coverage lists without losing key actions.
Verify/Time: 2026-05-12 15:55-16:05 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified `Compact queue` toggles to `Detailed queue`, with only React DevTools/HMR/Fast Refresh console logs.
