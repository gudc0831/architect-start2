Req: Implement Slice 63 Knowledge copy Markdown action.
Diff: Added `Copy Markdown` in `/admin/knowledge`, copied the current draft body through the clipboard API, surfaced copy status, and updated the user guide.
Why: Admins need to move an in-progress WIKI draft into external review notes or handoff channels while preserving current edits.
Verify/Time: 2026-05-12 19:45 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified `Copy Markdown` renders and is enabled for a populated draft body.
