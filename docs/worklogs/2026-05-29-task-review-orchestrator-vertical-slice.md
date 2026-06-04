Req: Start the server-side task review orchestrator implementation from the browser assistant PLAN.md section 32 handoff.
Diff: Added a SaaS server official-law verifier using server-only `LAW_OPEN_DATA_OC`, added `/api/assistant/task-review`, and added a validation script for OC redaction, missing-secret blocking, and the no-WIKI-approve boundary.
Why: Deployed task review needs official law API verification inside the SaaS server credential boundary while preserving the existing retrieval and Knowledge admin approval boundaries.
Verify/Time: 2026-05-29 KST. `npm run typecheck` passed. `npm run task-review:validate` passed with mocked law.go.kr responses and static approve-route guard checks.
