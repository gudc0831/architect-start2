Req: Make `/daily` and workspace tab entry feel closer to spreadsheet tab switching, especially first load.
Diff: Added `/api/workspace/bootstrap`, shared client bootstrap cache, and initial Provider wiring so workspace auth/project/active-tasks use one request on first entry.
Why: The previous warmup helped hover/idle navigation after load, but cold entry still waited on separate client auth, project, and task reads.
Verify/Time: `npm run typecheck`, `npm run lint`, `npx tsx scripts/daily-editing-responsiveness-verify.ts`, and `npm run build` passed.
