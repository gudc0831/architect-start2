Req: Implement and verify Slice 44 assistant audit cleanup stale-unreviewed shortcut.
Diff: Added `Show stale unreviewed` to set cleanup coverage preset to stale unreviewed and stale days to zero; updated user guide.
Why: Cleanup governance reviewers need one action for the most urgent unreviewed stale cleanup scope.
Verify/Time: 2026-05-12 14:26 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; Browser UI verified `Show stale unreviewed` sets coverage preset to `stale_unreviewed` and stale days to `0`; console showed React DevTools/HMR/Fast Refresh logs only.
