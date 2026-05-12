Req: Implement and verify Slice 22 filtered governance note export/reporting across assistant action audits.
Diff: Added governance note report and CSV export APIs, added Admin UI report filters/cards/drill-down links, and documented the workflow in `사용자 가이드.md`.
Why: Admin reviewers need read-only cross-audit review of append-only governance notes by category, reviewer, task, and assistant record without editing source audit records.
Verify/Time: 2026-05-12 10:27 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; report API/filter/export returned expected note rows and CSV; Playwright verified `/admin/assistant` report filters, export URL, review audit drill-down, and mobile layout.
