Req: Diagnose and harden `/daily` drag reorder reverting after browser refresh on the Vercel Preview.
Diff: Added local pending-order replay, keepalive/Beacon save paths, expected-version guarded `set_sibling_order`, no-op duplicate replay handling, same-session retry, and optimistic-temp-id reorder guards.
Why: Spreadsheet-style behavior needs local durable pending mutations that appear immediately, but stale replays must not overwrite newer server/user order and transient failures must keep trying.
Verify/Time: 2026-05-21 KST. `npm run typecheck`, `npm run lint`, `npx tsx scripts/daily-editing-responsiveness-verify.ts`, and `npm run build` passed; browser Preview signoff remains user-side.
