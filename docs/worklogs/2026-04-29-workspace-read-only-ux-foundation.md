Req: Continue Step 7 collaboration management UX with role-aware workspace behavior.
Diff: added current project role to project selection payload/provider, made task workspace mutation controls depend on `canEditProjectWorkspace`, hid create/reorder/upload/trash mutation controls for read-only roles, and added read-only denial copy.
Why: viewer can read project/task/file data and member-visible assignee data, but must not discover write denial only through failed API calls.
Verify/Time: `npm run typecheck` passed on 2026-04-29; no DB migration or policy rollout required for this slice.
