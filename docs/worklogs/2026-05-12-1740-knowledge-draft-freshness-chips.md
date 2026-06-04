Req: Implement and verify Slice 57 Knowledge draft freshness chips.
Diff: Added read-only created, updated, and reviewed timestamp chips to the Knowledge WIKI draft editor; updated user guide.
Why: Knowledge admins need freshness context before approving or rejecting candidate WIKI content.
Verify/Time: 2026-05-12 17:40-17:50 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified Created/Updated/Reviewed chips render on `/admin/knowledge`, with only React DevTools/HMR/Fast Refresh console logs.
