Req: Implement and verify Slice 48 assistant audit cleanup queue shortcuts.
Diff: Added queue-level shortcuts for stale, reviewed, and all cleanup coverage; updated user guide.
Why: Reviewers should be able to switch queue scopes from the grouped queue area without returning to the main filter controls.
Verify/Time: 2026-05-12 15:25-15:35 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified queue shortcut labels render and `Focus reviewed` sets Coverage preset to `reviewed`, with only React DevTools/HMR/Fast Refresh console logs.
