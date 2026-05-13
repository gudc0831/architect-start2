Req: Implement Slice 366 Obsidian remote inventory import contract.
Diff: Added sanitized Obsidian inventory manifest metadata to provider target config, Admin UI inventory input/status, and reconciliation create/update/delete/noop comparison for dry-run provider previews.
Why: Slice 365 could generate reviewable Obsidian operations, but without remote inventory it could only plan creates; live-write readiness needs path/digest comparison first.
Verify/Time: API validation passed for inventory sanitization and create/update/delete/noop reconciliation; Browser UI validation passed for `/admin/knowledge` inventory status and provider preview counts; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing React hook warnings on 2026-05-13 14:25 KST.
