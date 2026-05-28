Req: Commit and push the active preview branch safely after confirming whether the Vercel preview flow has issues.
Diff: Cast protected-route redirects and client replaces to Next `Route`; preserved the current `@prisma/adapter-pg` lockfile update already present in the working tree.
Why: Local typecheck/build were blocked by typed route overload errors before the branch could be pushed confidently.
Verify/Time: `npm run typecheck`, `npm run build`, `npm run lint`, `npm ls @prisma/adapter-pg @prisma/client prisma @prisma/driver-adapter-utils` passed / 2026-05-28 KST.
