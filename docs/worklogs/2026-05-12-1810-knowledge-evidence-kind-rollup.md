Req: Implement and verify Slice 59 Knowledge evidence-kind rollup chips.
Diff: Added read-only evidence-kind count chips to the Knowledge WIKI draft editor; updated user guide.
Why: Knowledge admins need to see what evidence types support a candidate before approval.
Verify/Time: 2026-05-12 19:45 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified evidence-kind rollup chips on `/admin/knowledge`.
