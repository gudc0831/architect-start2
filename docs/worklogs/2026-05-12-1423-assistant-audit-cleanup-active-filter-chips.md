Req: Implement and verify Slice 43 assistant audit cleanup active filter chips.
Diff: Added active cleanup review filter chips for category, coverage preset, reviewer, token, cleanup id, and stale threshold; updated user guide.
Why: Cleanup governance reviewers need to see the current report/export scope without scanning every filter field.
Verify/Time: 2026-05-12 14:23 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; Browser UI verified default scope chip and `stale 30 days` active filter chip; console showed React DevTools/HMR/Fast Refresh logs only.
