Req: Refresh the RBAC and multi-user transition plan so phase status matches the completed non-production readiness work.
Diff: marked Phases 4-7 complete for the current non-production slice, moved remaining items under production promotion deferral, and pointed completion criteria at the deployment readiness record.
Why: the active deployment plan already records RLS/Storage, assignee linkage, concurrency hardening, and conflict UX as complete; the base multi-user plan should not direct future work to repeat them.
Verify/Time: targeted search confirmed stale pending/next-active wording was removed; worklog and diff checks run on 2026-04-28.
