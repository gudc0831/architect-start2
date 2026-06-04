Req: Implement Slice 380 provider execution package review digest and category quick filters.
Diff: Added Admin Knowledge digest focus buttons, note-category quick-filter chips, category labels in review notes/handoff, and user-guide notes for the read-only quick filters.
Why: Reviewers need to narrow provider execution package review reports by digest and note category without manually copying filter values.
Verify/Time: `npm run typecheck`; `npm run lint` with 7 pre-existing React hook warnings; direct `tsx` provider review report validation; `npm run build`; Browser UI validation on local auth-stub `next start -p 3001` for digest and category quick filters, with dev server blocked by existing `.next/dev` EPERM | 2026-05-13 17:52 KST
