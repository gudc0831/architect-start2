Req: Make `/preview/daily` and `/preview/trash` render as read-only review surfaces without initial editing chrome, while keeping live task views unchanged.
Diff: Updated `src/components/tasks/task-workspace.tsx` so preview daily skips auto-selection, quick-create, edit/reorder/trash affordances, and uses a static detail panel; preview trash now shows informational cards only; removed incidental `.next-plan-build` type references from `tsconfig.json`.
Why: Recover preview width on initial load and align preview routes with non-mutating review behavior.
Verify: `npm run typecheck`; `npm run build`; browser checks for `/preview/daily` at `1440x900`, `1280x800`, `1024x768`, plus `/preview/trash`, `/preview/board`, and `/preview/calendar`.
