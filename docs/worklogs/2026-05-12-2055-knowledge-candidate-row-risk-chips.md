Req: Implement Slice 70 Knowledge candidate row risk chips.
Diff: Added confidence band, reviewed/unreviewed, and cleanup-state chips to `/admin/knowledge` candidate rows, and updated the user guide.
Why: Queue triage should show key risk signals without requiring a candidate detail open.
Verify/Time: 2026-05-12 21:05 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing hook warnings; `/api/admin/knowledge/candidates` returned 200; agent-browser verified confidence band, reviewed/unreviewed, and cleanup-state chips in candidate queue rows.
