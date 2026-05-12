Req: Implement and verify Slice 51 Knowledge candidate queue counts.
Diff: Added candidate, approved, rejected, and all counts to the Knowledge Admin candidate queue; updated user guide.
Why: Knowledge admins need state totals before filtering the WIKI candidate queue.
Verify/Time: 2026-05-12 16:10-16:20 KST; `npm run typecheck`; `npm run lint` (passes with 7 pre-existing hook warnings outside this slice); Browser UI verified Candidate/Approved/Rejected/All count labels render on `/admin/knowledge`, with only React DevTools/HMR/Fast Refresh console logs.
