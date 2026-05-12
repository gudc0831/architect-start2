Req: Implement and verify Slice 42 assistant audit cleanup clear-filter action.
Diff: Added `Clear cleanup filters` to reset cleanup category, preset, reviewer, token, cleanup id, and stale threshold; updated user guide.
Why: Cleanup governance reviewers need to return to the default all-runs view after using quick filters.
Verify/Time: 2026-05-12 14:20 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; Browser UI verified `Clear cleanup filters` resets reviewer/token/cleanup id, stale days to `7`, and coverage preset to `all`; console showed React DevTools/HMR/Fast Refresh logs only.
