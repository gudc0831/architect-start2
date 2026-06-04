Req: Implement and verify Slice 61 Knowledge clear search action.
Diff: Added a `Clear` action beside Knowledge candidate search that resets only search text; updated user guide.
Why: Knowledge admins need to clear text search without losing the active candidate state filter.
Verify/Time: 2026-05-12 19:45 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified `Clear` resets search while preserving the active state filter.
