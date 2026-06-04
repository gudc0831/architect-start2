Req: Implement and verify Slice 60 Knowledge draft length counters.
Diff: Added read-only title, summary, body, and tag counters to the Knowledge WIKI draft editor; updated user guide.
Why: Knowledge admins need quick size signals while editing WIKI draft content.
Verify/Time: 2026-05-12 19:45 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified Title/Summary/Body/Tags counters on `/admin/knowledge`.
