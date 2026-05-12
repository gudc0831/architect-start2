Req: Implement and verify Slice 21 assistant audit evidence package export for operational review.
Diff: Added per-record Markdown package export API, added `Export package` in assistant action audit governance detail, updated responsive actions, and documented the workflow in `사용자 가이드.md`.
Why: Admin reviewers need portable read-only evidence that combines audit fields, assistant record context, task snapshots, provenance, governance notes, and raw metadata for one approved assistant action audit.
Verify/Time: 2026-05-12 10:15 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; package API returned 200 Markdown attachment with governance note/provenance/raw metadata; Playwright verified `/admin/assistant` detail export link on desktop and 390px width.
