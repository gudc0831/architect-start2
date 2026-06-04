Req: Start Step 11 collaboration Preview verification from the prepared checklist.
Diff: Ran local automated checks, confirmed Preview DB migration status, read current Preview role/account baseline, and checked Preview URL protection status.
Why: Browser role and collaboration checks need a clean automated baseline plus exact blockers before asking the user for account/session actions.
Verify/Time: `npm run typecheck`; `npm run lint`; `npm run build`; `npm run deps:audit`; `npx prisma validate`; `npm run data:doctor`; Preview role read-only query; `curl.exe -I` on branch/deployment Preview URLs / 2026-04-30 KST.
