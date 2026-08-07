# Full code and data audit remediation

Req: Repair every actionable finding from the multi-agent whole-repository code, security, Daily responsiveness, and data-integrity audit, then report exact changes and verification.
Diff: Closed upload/download MIME and Storage ownership gaps; made file purge durable; bounded extraction; made access and assistant-budget mutations concurrency-safe; revalidated Task Review evidence server-side; capped unbound saved answers; added idempotent assistant response replay; completed journal-first Daily task/file mutations; hardened local/cloud backup, restore, bootstrap, import, and backend mutation consistency; repaired UI-copy literals and stale validators; upgraded Next.js to 16.2.12, Firebase to 12.17.0, Prisma CLI/client/adapter to 7.9.1, and patched vulnerable transitive packages with narrow overrides.
Why: Prevent cross-tenant object deletion, active-content rendering, ambiguous-upload data loss, stale legal-confidence claims, assistant budget leaks/duplicate counts, optimistic UI loss after reload, partial restore success, incomplete backup coverage, and unsafe legacy retries.
Verify: `npm audit` and `npm audit --omit=dev` both report 0 vulnerabilities; `npm run db:generate`, `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run daily:editing:verify`, `npm run data:guard:validate`, `npm run db:bootstrap:validate`, `npm run project-context:validate`, `npm run task-assistant:unified:validate`, `npm run task-review:validate`, `npm run legal-change-monitor:validate`, `npm run legal-search:validate`, and the API security validator passed after the dependency remediation on 2026-08-03 KST.
External gates: Real cloud DB/Storage and authenticated HTTP drills were not run; `pg_dump`/`pg_restore` are not on this PC PATH; full DB+Storage atomic restore remains intentionally blocked. No commit, push, merge, deployment, DB migration, or external data mutation was performed.

Failure: The 2026-08-07 pre-push audit newly classified the pinned `fast-uri` 3.1.4 override as high severity under GHSA-7p8r-x3mc-p8w7.
Cause: The advisory was published after the earlier 0-vulnerability verification and marks the 3.x line before 3.1.5 as affected.
Fix: Raised only the existing `fast-uri` override to the patched 3.1.5 release and regenerated the lockfile without install scripts.
Evidence: `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` returned 0 vulnerabilities on 2026-08-07 KST.
Prevention: Re-run live dependency audits immediately before publication even when an earlier worklog records a clean result.

Failure: `npm run ui-copy:validate` returned exit 1 after its validator, typecheck, lint, and build all passed.
Cause: The report step requires translator status metadata that is not present in this checkout; it also rewrites tracked report and Next type artifacts.
Fix: Kept the direct validator result as evidence and restored the generated report, `next-env.d.ts`, `tsconfig.json`, and `output/ui-copy` artifacts before commit.
Evidence: The wrapper printed `status=passed warnings=0 failures=0`, `typecheck=ok`, `lint=ok`, and `build=ok`; only `status file errors=1` remained.
Prevention: Run the UI-copy wrapper alone and treat its report/output and Next type rewrites as generated artifacts unless translator status is part of the requested workflow.
