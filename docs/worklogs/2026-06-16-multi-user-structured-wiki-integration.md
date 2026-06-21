Req: Integrate structured approved WIKI work into `codex/multi-user-transition` Preview branch and keep root-entry/admin UX fixes.
Diff: Fast-forwarded to `df809f89fe713dbca479656383fc2eef3671e8d3`, reapplied root-entry smoke plus admin knowledge hierarchy changes, and preserved the pre-merge dirty state in a local safety stash.
Why: The user was checking the multi-user Preview while structured WIKI had only been deployed from a separate branch.
Verify/Time: `db:generate`, Prisma validate, structured WIKI validators, `typecheck`, `lint`, `build`, and `root-entry:smoke -- --url http://localhost:3000` passed on 2026-06-16.
Deploy Verify: Preview direct URL release smoke passed; public auth pages and `/auth/post-login` now avoid unauthenticated browser 401s so root-entry smoke does not fail on expected login redirects.
Smoke Harness: `root-entry:smoke` now creates a Supabase magic-link smoke session when explicit cookie/storage state is absent but Preview Supabase env is available.
Final Preview: `f0c5279c05d70e7840e458084290b359075ebba4` deployed Ready at `architect-start2-6mjpms7ig-chois-projects-7b2948cf.vercel.app`; branch alias `architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app` passed `structured-knowledge:preview-smoke:release` no-skip and strengthened `root-entry:smoke`.
Reverify: The branch alias passed `structured-knowledge:preview-smoke:release` no-skip with 51 checks and 0 skips, then passed `root-entry:smoke` with `/` and `/auth/post-login` ending at `/board`, `/board` staying on `/board`, and `/daily` staying on `/daily`.
Feature Retention: The deployed smoke covered candidate management, evidence review, source buckets, structured draft subviews, approved WIKI, local WIKI import, operations, and generation profile controls; `git diff --name-status df809f89fe713dbca479656383fc2eef3671e8d3..HEAD` showed no deleted files, and `structured-knowledge:ui-contract:validate` plus `knowledge-admin:tabs:validate` passed.

2026-06-17 Integration Closeout:
Req: Re-check the structured approved WIKI worktrees before committing the `architect-saas` closeout state.
Diff: Confirmed `codex/structured-approved-wiki-impl` (`df809f89fe713dbca479656383fc2eef3671e8d3`) and `codex/structured-approved-wiki` (`b315f875331f7623a04655b19e97c7e08716501e`) are already ancestors of `codex/multi-user-transition`; no merge or manual copy was needed. Kept the target worktree `PLAN.md` legal-corpus boundary link and Knowledge admin summary layout fix as the active commit candidates.
Why: The source worktrees still exist and include stale path-local docs/PLAN variants, so the integration decision needed a durable record before commit/deploy work.
Verify: `git fetch origin --prune`; `git rev-list --left-right --count HEAD...origin/codex/multi-user-transition` -> `0 0`; `git merge-base --is-ancestor df809f89fe713dbca479656383fc2eef3671e8d3 HEAD`; `git merge-base --is-ancestor b315f875331f7623a04655b19e97c7e08716501e HEAD`.

2026-06-17 Commit Gate:
Req: Validate the final target worktree before commit/deploy, including the approved DB and recovery gates where environment support exists.
Diff: No new runtime code was required beyond the PLAN link, integration worklog, and Knowledge admin summary layout CSS already present in the target worktree.
Why: The release branch should not claim DB migration, cloud backup, or deploy readiness from target-state docs; it should record the exact local and environment-dependent gates that actually ran.
Verify: `npm run db:generate` -> ok; `npm run data:backup` -> local snapshot `local-2026-06-17T01-39-55-009Z-cae78474`, cloud backup unavailable in this environment; `npm run db:migrate:safe` -> blocked before mutation because `APP_BACKEND_MODE=cloud` and `DATABASE_URL` are not both configured; `npm run deploy:migration-gate` -> skipped for the same cloud target configuration reason; `npm run structured-knowledge:repository:validate` -> ok; `npm run knowledge-admin:tabs:validate` -> ok; `npm run structured-knowledge:ui-contract:validate` -> ok; `npm run worklog:check` -> ok; `npm run typecheck` -> ok; `npm run knowledge-wiki:security:validate` -> ok; `npm run legal-search:validate` -> `legal-search-adapter-pass`; `npm run verified-legal-candidate-import:validate` -> `verified-legal-candidate-import-pass`; `npm run lint` -> ok; `npm run build` -> ok; `npx prisma validate --schema prisma/schema.prisma` -> schema valid; `git diff --check` -> CRLF normalization warnings only.
Residual: No cloud DB mutation occurred because this shell does not have the cloud database target configured. Restore was not executed because no restore snapshot target was specified.

2026-06-17 Recovery Gate:
Req: Exercise the approved operational recovery checks while keeping R2 corpus recovery separate from SaaS DB recovery.
Diff: No restore or rollback was performed. R2 recovery was verified read-only from the current pointer, and SaaS recovery was limited to `data:backup` because this environment does not have a cloud DB target configured.
Why: The legal corpus source of truth lives in R2 while approved WIKI and operational SaaS rows live in the SaaS DB; one rollback path must not be reported as the other.
Verify: `node --env-file=.env --import tsx scripts/r2-recovery-report.ts` in `verified-legal-evidence-api` -> passed for current snapshot `2026-06-17-r2-upload-fixed-20260617003300Z`, with manifest/sources/chunks/active-index digest and size verification; `node --env-file=.env --import tsx scripts/r2-runtime-gate.ts` -> passed with 3 simulated cold-start instances and no additional R2 reads during warm searches; `node --env-file=.env --import tsx scripts/r2-security-gate.ts` -> passed, public access denied and read-token write denied, deletion not requested; `npm run backup:recovery:validate` -> passed.
Residual: No R2 pointer rollback was executed because no alternate known-good target was requested. No SaaS DB restore was executed because `data:restore` is local-snapshot only and no restore snapshot target was requested.

2026-06-17 Preview Deploy Retry:
Req: Deploy the committed `architect-saas` Preview after explicit approval for Vercel upload.
Failure: The first `npx --yes vercel@latest deploy --yes` failed before deploy because the local Korean user/host string was rejected as an HTTP header value by Vercel CLI. The retry with ASCII hostname preload reached upload but failed with `File size limit exceeded (100 MB)`.
Cause: The repo had no `.vercelignore`, so local-only artifacts such as `.next-build/cache/webpack/server-production/0.pack` and `node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node` were eligible for upload despite being ignored by Git.
Fix: Added `.vercelignore` mirroring the repo's local build/dependency/output/env exclusions so Preview deploy uploads source inputs, not local caches or secret env files.
Evidence: `Get-ChildItem -Recurse -File | Where-Object Length -gt 90000000` identified `.next-build/cache/webpack/server-production/0.pack` at 281505566 bytes and the local Next SWC binary at 136858624 bytes; `.gitignore` already ignored those paths, but `.vercelignore` did not exist.
Prevention: Keep `.vercelignore` aligned with local-only `.gitignore` exclusions whenever adding large local build/cache/output directories.
