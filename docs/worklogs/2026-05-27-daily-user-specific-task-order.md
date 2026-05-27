Req: Make task reorder personal per user with the lowest-risk scope, keeping Task as the issue model and applying personal order only to `/daily`.
Diff: Added `task_user_orders` storage, cloud repository read/upsert support, `/api/tasks?orderScope=daily`, `/api/tasks/reorder` user-order routing, daily bootstrap/order fetch wiring, and export ordering by the current user's daily order.
Why: `/daily` manual/auto reorder should no longer mutate global `tasks.sibling_order`; `/board` and `/calendar` keep the default task order while daily users can keep their own order.
Verify/Time: `npm run db:generate`; `npx tsc --noEmit --incremental false`; `npx tsx scripts/daily-editing-responsiveness-verify.ts` | 2026-05-27 KST.
