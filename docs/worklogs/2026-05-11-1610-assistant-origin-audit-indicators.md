Req: Implement and verify 15 assistant-origin audit indicators in task detail/history for approved assistant summary task changes.
Diff: Added read-only `AI provenance` detail-panel indicators, assistant marker parsers, parent follow-up child task summaries, CSS, and user-guide notes.
Why: Operators need to see assistant record and follow-up task provenance from the normal `/daily` task detail surface.
Verify/Time: 2026-05-11 16:09 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing warnings; `/daily` browser proof showed `AI provenance`, record id, and follow-up task `202`.
