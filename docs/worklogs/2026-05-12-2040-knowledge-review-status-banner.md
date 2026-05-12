Req: Implement Slice 69 Knowledge review status banner.
Diff: Added a read-only `/admin/knowledge` review status banner derived from readiness completion and guardrail warning count, and updated the user guide.
Why: WIKI approval review should surface the overall posture before admins inspect each detailed note.
Verify/Time: 2026-05-12 21:05 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified `Knowledge review status banner` on `/admin/knowledge`.
