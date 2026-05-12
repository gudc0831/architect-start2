Req: Implement and verify Slice 38 assistant audit cleanup reviewer quick filter.
Diff: Turned cleanup reviewer count entries into read-only quick filter buttons, added an all-reviewers reset action, styled the controls, and updated the user guide.
Why: Cleanup governance reviewers need to pivot from summary counts to reviewer-scoped notes, coverage rows, and exports without copying reviewer ids manually.
Verify/Time: 2026-05-12 14:03 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; Browser UI verified reviewer quick filter sets the cleanup reviewer field and console showed React DevTools/HMR/Fast Refresh logs only.
