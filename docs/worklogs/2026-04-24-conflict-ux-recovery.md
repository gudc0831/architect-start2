Req: add user-facing recovery behavior for the new recoverable `409` write-conflict paths.
Diff: preserved API response status/code in task workspace upload helpers and refreshed the affected file list when direct-upload commit returns `FILE_VERSION_CONFLICT`; existing task save/reorder conflict refresh paths remain intact.
Why: users should see localized conflict copy and a refreshed current state before retrying a file version upload after a concurrent write.
Verify/Time: `npm run typecheck` and `npm run lint` on 2026-04-24; lint still reports only the existing 7 React hook warnings.
