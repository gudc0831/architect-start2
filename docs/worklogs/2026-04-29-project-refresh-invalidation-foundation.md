Req: Continue Step 8 with project-scoped refresh/invalidation before full realtime collaboration.
Diff: added `/api/project/changes` no-store version endpoint and DashboardProvider project change polling that refreshes already-loaded active/trash scopes when task/file/project/member/invitation/access-request data changes.
Why: this provides server-visible multi-session refresh behavior without introducing a realtime channel authorization contract before presence/edit-lease work.
Verify/Time: `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run deps:audit` passed on 2026-04-29.
