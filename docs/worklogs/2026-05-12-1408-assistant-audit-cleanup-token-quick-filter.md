Req: Implement and verify Slice 39 assistant audit cleanup token quick filter.
Diff: Added `Focus token` to cleanup coverage rows and documented the read-only token quick filter.
Why: Cleanup governance reviewers need to isolate a cleanup preview token without manually copying it into the filter field.
Verify/Time: 2026-05-12 14:08 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; Browser UI verified `Focus token` applies `b0ad7bf1bf61cf86308c2afe` to the cleanup preview-token filter and console showed React DevTools/HMR/Fast Refresh logs only.
