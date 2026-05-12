Req: Implement Slice 64 Knowledge copy source handoff action.
Diff: Added `Copy source handoff` in `/admin/knowledge`, assembled candidate/task/project/state/scope/confidence/evidence context for clipboard copy, and updated the user guide.
Why: Admins need a compact provenance handoff for WIKI candidates alongside the editable Markdown copy path.
Verify/Time: 2026-05-12 19:45 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified `Copy source handoff` renders beside the draft tools.
