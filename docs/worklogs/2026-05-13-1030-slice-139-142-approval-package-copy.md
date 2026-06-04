Req: Implement Slices 139-142 for Knowledge approval package copy.
Diff: Added approval package summary chips, `Copy approval package`, draft package section, evidence package section, and user guide notes.
Why: Final reviewers need a single copyable handoff that combines draft, decision, blocker, and evidence context.
Verify/Time: 2026-05-13 10:30-10:40 KST; `npm run typecheck`, `npm run lint` (known task Hook warnings only), `GET /api/admin/knowledge/candidates` 200, and Browser UI desktop/mobile clipboard/layout checks passed. Initial `networkidle` browser wait timed out; `domcontentloaded` rerun passed.
