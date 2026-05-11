Req: Implement and verify 16 structured assistant-action audit persistence for approved assistant task changes.
Diff: Added `/api/assistant/action-audits`, structured action audit normalization, popup audit writes, `/daily` detail-panel structured audit rendering, and user-guide notes.
Why: Approved assistant task updates and follow-up task creation need durable provenance beyond editable decision/note text markers.
Verify/Time: 2026-05-11 16:21 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing warnings; action audit GET/POST and `/daily` browser proof passed.
