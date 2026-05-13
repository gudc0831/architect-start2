Req: Implement Slice 301-350 approved WIKI guarded sync history from the export-readiness handoff.
Diff: Updated `src/components/admin/knowledge-admin-shell.tsx`, `src/components/admin/knowledge-admin-shell.module.css`, and `사용자 가이드.md` with local dry-run/blocked/simulated sync history, confirmation gating, copied history reports, and local-history clearing.
Why: Approved WIKI packages need an auditable admin-boundary step before external sync providers or server-side audit persistence are introduced.
Verify/Time: `npm run typecheck`; `npm run lint` with 7 pre-existing hook warnings; API 200 for `/api/admin/knowledge/items`, `/api/admin/knowledge/candidates`, `/admin/knowledge`; Browser UI dry-run/blocked/simulated/copy/clear/mobile checks | 2026-05-13 12:00 KST
