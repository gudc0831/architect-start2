Req: Implement Slice 62 Knowledge reset draft action.
Diff: Added a `Reset draft` editor action in `/admin/knowledge`, centralized candidate-detail-to-draft mapping, and updated the user guide.
Why: Admins reviewing WIKI candidates need a low-friction way to recover the source draft fields after exploratory edits.
Verify/Time: 2026-05-12 19:45 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified `Reset draft` restores edited title from the selected candidate detail.
