Req: Implement and verify Slice 55 Knowledge draft Markdown preview.
Diff: Added a read-only Markdown preview panel below the Knowledge WIKI draft body editor; updated user guide.
Why: Knowledge admins need to inspect the compiled WIKI draft body without leaving the editor or mutating candidate state.
Verify/Time: 2026-05-12 17:10-17:20 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified `Markdown preview` renders on `/admin/knowledge`, with only React DevTools/HMR/Fast Refresh console logs.
