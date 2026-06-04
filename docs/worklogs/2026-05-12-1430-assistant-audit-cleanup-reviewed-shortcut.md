Req: Implement and verify Slice 45 assistant audit cleanup reviewed shortcut.
Diff: Added `Show reviewed cleanup` to set cleanup coverage preset to reviewed and updated user guide.
Why: Cleanup governance reviewers need one action to return from stale-gap triage to reviewed cleanup evidence.
Verify/Time: 2026-05-12 14:30-14:45 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); API checked `/api/admin/assistant/cleanup-review-notes/coverage?month=2026-05&coveragePreset=reviewed&staleDays=7`; Browser UI verified `Show reviewed cleanup` sets Coverage preset to `reviewed`, with only React DevTools/HMR/Fast Refresh console logs.
