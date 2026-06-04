Req: Implement and verify Slice 37 assistant audit cleanup coverage filter handoff.
Diff: Added a read-only cleanup coverage handoff string, a copy action in the Admin cleanup review report, matching action styling, and user-guide documentation.
Why: Admin reviewers need to hand off the exact monthly cleanup coverage filter scope without reconstructing query parameters manually.
Verify/Time: 2026-05-12 13:58 KST; `npm run typecheck`; `npm run lint` passed with 7 pre-existing hook warnings; Browser UI verified `Copy filter handoff`, rendered handoff text, and console showed React DevTools/HMR/Fast Refresh logs only.
