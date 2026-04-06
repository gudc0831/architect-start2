Req: Restore calendar spillover task visibility in month grid and persist expanded board column state for default-collapsed statuses.
Diff: Updated `src/components/tasks/task-workspace.tsx` to split agenda vs month-grid calendar grouping and to store board collapsed-status preferences without reapplying defaults on write.
Why: The month grid dropped tasks on visible spillover days, and the `done` column could not stay expanded after reload because storage writes reintroduced the default collapsed value.
Verify: `npm run typecheck` passed; `npm run lint` completed with the existing `src/components/tasks/task-categorical-fields.tsx` hook-deps warnings.
