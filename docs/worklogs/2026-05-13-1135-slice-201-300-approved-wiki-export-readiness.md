Req: Implement Slices 201-300 approved Knowledge WIKI export/sync readiness from the planning flow.
Diff: Added export scope/format/target controls, readiness checks, stats, sync manifest/checklist copy, and JSON/Markdown download packages in `/admin/knowledge`; updated `사용자 가이드.md`.
Why: Approved WIKI entries need portable packages with lineage, tags, scope, body, and filter context before any external sync execution is introduced.
Verify/Time: typecheck pass; lint pass with 7 pre-existing task Hook warnings; candidates/items APIs 200; Playwright export panel/format/scope/target/actions verified | 2026-05-13 11:35
