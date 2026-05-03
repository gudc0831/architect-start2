Req: add a project-member-backed `assigneeProfileId` foundation while keeping legacy assignee text usable.
Diff: added nullable task profile FK/index/backfill migration, current-project member options API, server-side validation, member-scoped selects, and unresolved report SQL.
Why: assignment needs to move from free text toward project membership without breaking existing task display snapshots.
Verify/Time: `npm run typecheck`, `npx prisma validate`, `npm run lint`, `npm run build`, `npm run deps:audit`; local Semgrep CLI unavailable, so GitHub verifies Semgrep after push.
