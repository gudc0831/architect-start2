Req: Implement Slice 20 assistant audit governance note capture.
Diff: Added append-only governance note API, note form/list in action-audit drill-down, user-guide notes, and audit-event-backed note storage.
Why: Admin governance review needs note capture without mutating immutable assistant action audit metadata.
Verify/Time: 2026-05-12 09:57-10:02 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing warnings; note POST/detail API verification; Browser note form/list/save verification.
