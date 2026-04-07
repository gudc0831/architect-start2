Req: Recommend how to remove daily-list task click latency without changing the current UI/UX.
Diff: Analysis only; prioritized client render isolation, selection-state simplification, focus handling changes, and server-side PATCH fast paths for `task-workspace` and task update services.
Why: Preserve the current table/detail-panel interaction model while cutting full-table rerenders, effect-driven second renders, DOM query focus work, and unnecessary per-toggle backend reads.
Verify/Time: Grounded against `src/components/tasks/task-workspace.tsx`, `src/use-cases/task-service.ts`, and `src/repositories/postgres/store.ts` / 2026-04-07.
