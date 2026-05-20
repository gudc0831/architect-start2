Req: Make /daily task creation add the new task without replacing the whole workspace body with a loading state.
Diff: 3f +65/-25 | ...nents/tasks/task-quick-create.tsx, ...mponents/tasks/task-workspace.tsx, src/providers/dashboard-provider.tsx
Why: The create API already returns the task, so the client can upsert it locally and keep background project-change refreshes silent after initial load.
Verify/Time: npm run lint; npm run db:generate; npm run typecheck; npm run build; Browser plugin local navigation blocked with ERR_BLOCKED_BY_CLIENT. | 15:25-15:25 (0m)
