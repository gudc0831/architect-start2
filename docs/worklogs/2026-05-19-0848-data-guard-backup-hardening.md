Req: DB backup coverage, restore boundary, Storage delete audit, dependency audit, and build output stability
Diff: 8f +582/-416 | docs/data-guard-cloud-restore.md, package-lock.json, package.json +5
Why: Reduce accidental cloud data loss and high dependency audit risk without executing destructive cloud restore or delete operations
Verify/Time: npm run data:doctor; npm run data:backup; Node backup JSON tableCounts parser; npm run typecheck; npm run lint; npm run build; npm run deps:audit | 08:35-08:48 (13m)
