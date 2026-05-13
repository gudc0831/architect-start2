Req: Implement Slice 367 Obsidian live-write feature flag and rollback preflight.
Diff: Added default-disabled Obsidian live-write flag metadata, execution `preflight_recorded` status, live-write preflight artifact fields, Admin UI preflight rendering, and user guide notes.
Why: Obsidian reconciliation and inventory comparison are available, but a future mutation adapter needs an explicit flag and rollback evidence boundary before live writes can be considered.
Verify/Time: API validation passed for disabled/enabled flag preflight behavior and operation count; Browser UI validation passed for `/admin/knowledge` preflight rendering; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing React hook warnings on 2026-05-13 15:31 KST.
