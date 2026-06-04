Req: Directly verify why `/daily` still felt slow after bootstrap and improve first visible rows.
Diff: Measured Preview row readiness at 8.5-9.2s, decoupled auth/project from slow task bootstrap, and added IndexedDB active-task snapshot restore/write.
Why: Combining reads reduced request count but let the slow task read block project/auth readiness; spreadsheet-like entry needs local rows before server freshness.
Verify/Time: `npx tsx scripts/daily-editing-responsiveness-verify.ts`, `npm run typecheck`, `npm run lint`, and `npm run build` passed; Preview rows were 8.5-9.2s before, then 2.8s/1.9s with snapshot after one warm load.
