Req: Implement and verify Slice 58 Knowledge draft approval summary chips.
Diff: Added read-only state, cleanup state, confidence, and review status chips to the Knowledge WIKI draft editor; updated user guide.
Why: Knowledge admins need approval context visible beside draft source and freshness metadata.
Verify/Time: 2026-05-12 19:45 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified State/Cleanup/Confidence/Review chips on `/admin/knowledge`.
