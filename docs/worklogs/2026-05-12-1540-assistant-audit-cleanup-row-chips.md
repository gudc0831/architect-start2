Req: Implement and verify Slice 49 assistant audit cleanup row chips.
Diff: Added read-only metadata chips to cleanup queue rows for review status, stale state, note count, reviewer count, and stale threshold; updated user guide.
Why: Queue reviewers need compact row metadata for triage without reading every detail field.
Verify/Time: 2026-05-12 15:40-15:50 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified row chip categories render for reviewed/not stale/notes/reviewers/day threshold, with only React DevTools/HMR/Fast Refresh console logs.
