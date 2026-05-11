Req: Implement and verify 14 approved work-summary task update suggestions and follow-up task proposals for the `/daily` in-page assistant popup.
Diff: Added post-approval `Task 반영 제안` UI, explicit task PATCH action, explicit follow-up child task POST action, proposal styling, and user-guide notes.
Why: Approved assistant summaries should not mutate task records until the operator confirms a separate task update or follow-up creation action.
Verify/Time: 2026-05-11 15:53 KST; `npm run typecheck` passed; `npm run lint` passed with 7 pre-existing warnings; `/daily` browser proof passed and created follow-up task `202`.
