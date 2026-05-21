Req: Diagnose `/daily` drag reorder reverting after browser refresh on the Vercel Preview.
Diff: Kept the latest reorder persist command in a client ref, added keepalive to reorder saves, and send the latest pending order on page unload via Beacon with a keepalive fetch fallback.
Why: The optimistic UI showed the row move immediately, but a normal background fetch could still be canceled by a quick refresh before the server stored the final sibling order.
Verify/Time: 2026-05-21 KST. `npm run typecheck`, `npm run lint`, `npx tsx scripts/daily-editing-responsiveness-verify.ts`, and `npm run build` passed. User browser verification on the Vercel Preview remains the signoff step.
