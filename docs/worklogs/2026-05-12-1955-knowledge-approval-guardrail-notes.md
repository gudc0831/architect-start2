Req: Implement Slice 66 Knowledge approval guardrail notes.
Diff: Added read-only approval guardrail notes in `/admin/knowledge`, derived from readiness, evidence, confidence, and candidate state, and updated the user guide.
Why: Admins need explicit approval risk notes without changing the current approval API behavior.
Verify/Time: 2026-05-12 21:05 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified `Approval guardrails` notes on `/admin/knowledge`.
