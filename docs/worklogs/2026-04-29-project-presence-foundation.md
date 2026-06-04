Req: Continue collaboration expansion Step 9 with visible, non-authoritative project presence and active editor signals.
Diff: Added project-scoped Supabase Presence in the task workspace, online-user display, active field editor display, and updated implementation progress notes.
Why: Multi-user context should be visible before authoritative edit leases are introduced; task viewing and selection still do not block editing.
Verify/Time: `npm run typecheck`; `npm run lint`; `npm run build`; `npm run deps:audit`; `npm run worklog:check`; `git diff --check` / 2026-04-29 KST.
