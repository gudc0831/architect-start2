Req: Implement Slice 68 Knowledge copy approval checklist action.
Diff: Added `Copy approval checklist` in `/admin/knowledge`, copying candidate state, confidence, evidence mix, readiness, and guardrail notes, and updated the user guide.
Why: Admins need to share approval readiness without changing WIKI candidate data.
Verify/Time: 2026-05-12 21:05 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified `Copy approval checklist` renders and status updates after clipboard-stubbed click.
