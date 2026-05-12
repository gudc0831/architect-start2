Req: Implement and verify Slice 40 assistant audit cleanup-id quick filter.
Diff: Added `Focus cleanup` to cleanup coverage rows and documented the read-only cleanup-id quick filter.
Why: Cleanup governance reviewers need to isolate one cleanup audit run without manually copying its id into the filter field.
Verify/Time: 2026-05-12 14:12 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; Browser UI verified `Focus cleanup` applies cleanup id `a9c28b2b-81f0-4879-9952-f6b8f1be18f5` and console showed React DevTools/HMR/Fast Refresh logs only.
