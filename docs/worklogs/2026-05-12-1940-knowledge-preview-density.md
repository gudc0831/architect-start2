Req: Implement Slice 65 Knowledge preview density toggle.
Diff: Added a compact/expanded Markdown preview toggle in `/admin/knowledge` and updated the user guide.
Why: Admins need to switch between full body review and compact metadata/evidence triage without changing draft content.
Verify/Time: 2026-05-12 19:45 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified `Compact preview` toggles to `Expanded preview`.
