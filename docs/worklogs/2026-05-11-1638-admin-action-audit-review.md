Req: Implement Goal 17 admin-facing assistant action audit review with filters and /daily task links.
Diff: Added shared action-audit parsing, an admin action-audits API, /admin/assistant review UI with action/task/assistant-record/actor filters, /daily taskId query focus, and user-guide notes.
Why: Admin users need a structured review surface for assistant-applied task changes instead of inspecting raw audit events.
Verify/Time: 2026-05-11 16:38-16:50 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing warnings; `npm run worklog:check`; action-audit API filter checks; browser `/admin/assistant` list/filter and `/daily?taskId=arch-task-001` detail focus checks passed.
