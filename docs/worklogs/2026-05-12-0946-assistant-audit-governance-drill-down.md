Req: Implement Slice 19 assistant audit governance drill-down.
Diff: Added admin action-audit detail API, read-only Review details panel, governance/task/provenance summaries, user-guide notes, and retained export/list behavior.
Why: Admin users need one per-record operational review view instead of jumping between audit list, assistant records, closure fields, and task detail.
Verify/Time: 2026-05-12 09:18-09:46 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing warnings; detail API smoke check; Browser `/admin/assistant` Review details panel verification.
