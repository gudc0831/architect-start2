Req: Implement and verify Slice 56 Knowledge draft source-reference chips.
Diff: Added read-only source chips for task id, assistant record id, evidence count, and publication scope in the Knowledge WIKI draft editor; updated user guide.
Why: Knowledge admins need source context visible beside the draft before approving WIKI content.
Verify/Time: 2026-05-12 17:25-17:35 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified Task/Record/evidence/Scope chips render on `/admin/knowledge`, with only React DevTools/HMR/Fast Refresh console logs.
