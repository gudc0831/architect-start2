Req: Diagnose and fix the `/daily` sync failure that appears after editing a task text/content field.
Cause: With daily cell documents enabled, text fields (`issueTitle`, `issueDetailNote`, `decision`) must save through `/api/task-cell-documents`, but focus/detail save paths could still enqueue or send direct `/api/tasks/[taskId]` PATCH requests, which the server rejects as `TASK_CELL_DOCUMENT_FIELD_DIRECT_WRITE_BLOCKED`.
Diff: Routed text-only cell-document patches through the cell-document API, prevented inline text-cell commits from adding a normal daily mutation, and added recovery for existing failed text-cell daily mutations.
Failure learning: A cell-document backed UI edit can have two save paths; both the editor commit and any focus/continuous-action fallback must be checked before treating the outbox as correct.
Verify: `npm run daily:editing:verify`; `npm run daily:cell-collaboration:verify`; `npm run typecheck`.
Risk: No live browser smoke was run in this turn, so deployed/local IndexedDB cleanup was verified by code path and static/type checks rather than an authenticated UI session.
