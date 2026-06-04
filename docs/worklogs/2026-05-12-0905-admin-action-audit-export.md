Req: Implement Slice 18 admin assistant action audit CSV export with guide and verification.
Diff: Added filtered CSV export API, admin Export CSV link, user-guide notes, and retained read-only audit review behavior.
Why: Admin users need portable filtered assistant action audit evidence for operational review.
Verify/Time: 2026-05-12 08:56-09:05 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing warnings; export API header/body and filtered row checks; Browser `/admin/assistant` export link/filter URL verification.
