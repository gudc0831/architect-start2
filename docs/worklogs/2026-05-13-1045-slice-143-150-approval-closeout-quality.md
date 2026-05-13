Req: Implement Slices 143-150 for Knowledge approval package quality and final closeout.
Diff: Added package quality checks, package quality copy, final review closeout guidance, final closeout copy, and user guide notes in Knowledge Admin.
Why: Reviewers need to know whether an approval package is complete and what the final next action should be before approving or rejecting WIKI knowledge.
Verify/Time: 2026-05-13 10:45-11:10 KST; `npm run typecheck`, `npm run lint` (known task Hook warnings only), `GET /api/admin/knowledge/candidates` 200, and Browser UI desktop/mobile clipboard/layout checks passed.
