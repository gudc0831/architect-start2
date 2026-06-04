Req: Implement Slice 67 Knowledge guardrail summary chips.
Diff: Added guardrail summary chips in `/admin/knowledge` for warning count, readiness ratio, and confidence band, and updated the user guide.
Why: Admins need to scan approval risk quickly before reading each guardrail note.
Verify/Time: 2026-05-12 21:05 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified guardrail warning count, readiness ratio, and confidence band chips.
