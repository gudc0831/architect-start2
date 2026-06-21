# SaaS Open Items Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the currently open Architect SaaS plan items by proving the remaining Preview checks, recording conditional deferrals, and keeping Production gated.

**Execution status (2026-06-18 KST):** Machine-executable closeout work is complete and recorded in `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-18-saas-open-items-closeout.md`. Preview API/browser/file/two-window checks, verified-legal Preview boundary checks, R2 recovery/runtime/security proof, local backup proof, and dependency audit remediation were completed. Real Google OAuth provider UI and specific invitation negative-edge checks remain user/provider-owned because they require actual Google identities or explicit fixtures. Production, restore/rollback, metadata table, scheduler, and paid/scale work remain gated/deferred.

**Architecture:** This is a closeout and verification plan, not a feature-build plan. `architect-saas` remains the SaaS orchestration surface, `verified-legal-evidence-api` remains the legal corpus and evidence provider, and `architect-browser-assistant` remains the browser/native execution surface. Items that require Production, DB writes, R2 writes, secret movement, or Web Store/native-host release stay behind explicit approval gates.

**Tech Stack:** Next.js/TypeScript in `D:/architect-workspace/architect-saas`, TypeScript/Node in `D:/architect-workspace/verified-legal-evidence-api`, Vercel Preview checks, Supabase Preview test accounts, Cloudflare R2 read-only recovery checks, PowerShell on Windows.

---

## Harness Mode

Strict.

- `choi`: coordinator, owns scope, final closeout, and plan/worklog updates.
- `hy`: collaboration Preview verification owner.
- `ung`: verified-legal Preview alias/env/smoke boundary owner.
- `ul`: read-only operating-boundary reviewer for metadata, backup/recovery, and paid/scale deferrals.

## Source Documents

Read these before execution:

- `D:/architect-workspace/architect-saas/PLAN.md`
- `D:/architect-workspace/architect-saas/docs/2026-04-29-collaboration-expansion-implementation-instructions.md`
- `D:/architect-workspace/architect-saas/docs/2026-04-30-collaboration-preview-verification-checklist.md`
- `D:/architect-workspace/architect-saas/docs/superpowers/plans/2026-06-09-cross-project-boundary-and-integration-plan.md`
- `D:/architect-workspace/architect-saas/docs/superpowers/plans/2026-06-09-verified-legal-centralization-plan.md`
- `D:/architect-workspace/architect-saas/docs/2026-04-24-release-readiness-signoff.md`
- `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-11-production-deferral-closeout.md`
- `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-17-verified-legal-r2-preview-env-refresh.md`
- `D:/architect-workspace/docs/operating-plans/legal-corpus-and-wiki-integrated-operations.md`
- `D:/architect-workspace/docs/runbooks/legal-corpus-and-saas-backup-recovery.md`
- `D:/architect-workspace/verified-legal-evidence-api/docs/runbooks/manual-legal-corpus-r2-refresh.md`
- `D:/architect-workspace/docs/worklogs/2026-06-17-first-full-legal-corpus-r2-upload.md`

## Closeout Classification

Close as verified:

- Existing SaaS Preview legal evidence boundary when alias/env/runtime proof still matches the current intended Preview deployment.
- Collaboration Step 11 only after Preview API probe plus browser/user checks are recorded.
- Backup/recovery procedure only as a read-only/recovery-report and documented restore-boundary closeout.

Close as conditional deferred:

- `architect-saas` legal corpus metadata tables.
- Raw LAW OPEN DATA payload archival.
- R2 snapshot retention.
- SaaS restore, cloud DB restore, R2 current-pointer rollback.
- Paid/scale expansion, pgvector, embedding scale-up, scheduler/Cron.

Keep open behind Production resume gate:

- Production URL/env/deploy/alias.
- Production Supabase/Postgres/OAuth configuration.
- Production verified-legal API target and secret parity.
- Browser Assistant Web Store upload, signed native-host installer, production origin allowlist.
- Authenticated production smoke.

## Task 1: Reconcile Current Plan Surface

**Files:**
- Read: `D:/architect-workspace/architect-saas/PLAN.md`
- Read: `D:/architect-workspace/docs/operating-plans/legal-corpus-and-wiki-integrated-operations.md`
- Read: `D:/architect-workspace/verified-legal-evidence-api/docs/runbooks/manual-legal-corpus-r2-refresh.md`
- Read: `D:/architect-workspace/docs/worklogs/2026-06-17-first-full-legal-corpus-r2-upload.md`
- Modify: `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-18-saas-open-items-closeout.md`
- Optional modify if stale wording is confirmed: `D:/architect-workspace/docs/operating-plans/legal-corpus-and-wiki-integrated-operations.md`
- Optional modify if stale corpus status wording is confirmed: append `D:/architect-workspace/docs/worklogs/2026-06-17-first-full-legal-corpus-r2-upload.md` or create `D:/architect-workspace/docs/worklogs/2026-06-18-first-full-legal-corpus-r2-upload.md`

- [ ] **Step 1: Capture repo and worktree state**

Run:

```powershell
cd D:\architect-workspace\architect-saas
git status --short --branch
git worktree list --porcelain
```

Expected:

- Branch is `codex/multi-user-transition`.
- Any pre-existing unrelated changes are listed and not reverted.
- The worker records whether `next-env.d.ts` or any other local file is already modified before closeout work starts.

- [ ] **Step 2: Resolve 2026-06-17 versus 2026-06-18 corpus status**

Read the manual refresh runbook and first-full-upload worklog. Record the current latest corpus status using only non-secret facts:

```text
latest documented full snapshot id
latest documented source count
latest documented chunk count
latest documented seed count
whether the runbook says the R2 write completed
whether any worklog still says the write is blocked
whether a fresh recovery report proves the active current pointer and artifact digests
```

Expected:

- If the manual refresh runbook and older first-full-upload worklog disagree, do not claim corpus closeout from either document alone.
- The current known reconciliation risk is that the manual runbook may document the 2026-06-18 curated normalized R2 snapshot upload while older worklog sections may still say no R2 write proceeded.
- Distinguish historical seed counts `1665` and `1664` from the latest approved/published count recorded by the manual runbook. Do not collapse them into one status.
- Treat a fresh recovery report as the active-state proof source for current pointer, immutable manifest, object byte sizes, and SHA-256 digests.
- The closeout worklog must say that the status surface needs reconciliation before any new R2 write, current-pointer movement, metadata migration, or scheduler work.
- If stale source wording is confirmed, append a dated correction or create a new dated worklog rather than silently editing history.

- [ ] **Step 3: Record the closeout taxonomy**

Create or update a compact closeout worklog under `docs/worklogs/` with:

```text
Req: Close selected SaaS plan-open items with verification/deferred boundaries.
Diff: Plan/worklog only; no runtime, DB, R2, Vercel, OAuth, Web Store, or native-host mutation.
Why: Existing open items mix Preview verification, Production gates, and conditional follow-ups.
Verify/Time: Source docs read; no commands with secrets; exact verification commands listed in plan.
```

Expected:

- The worklog states which items can be closed now, which are conditional deferred, and which remain Production-gated.
- No secret values, signed URLs, DB URLs, `OC=` URLs, cookies, or authorization headers are recorded.

## Task 2: Close Collaboration Preview Verification

**Files:**
- Read: `D:/architect-workspace/architect-saas/docs/2026-04-29-collaboration-expansion-implementation-instructions.md`
- Read: `D:/architect-workspace/architect-saas/docs/2026-04-30-collaboration-preview-verification-checklist.md`
- Read: `D:/architect-workspace/architect-saas/scripts/preview-collaboration-api-probe.ts`
- Modify: `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-18-collaboration-preview-closeout.md`

- [ ] **Step 1: Confirm target Preview**

Use the exact Preview root selected for closeout. The currently documented canonical branch alias is:

```text
https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app
```

Run read-only checks:

```powershell
cd D:\architect-workspace\architect-saas
npx vercel inspect https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --scope chois-projects-7b2948cf
```

Expected:

- Vercel reports the deployment as Ready.
- The inspected deployment id and commit SHA are recorded.
- If Vercel CLI fails from the Windows hostname issue, use the existing local ASCII-hostname workaround rather than changing machine-wide settings.

- [ ] **Step 2: Run local recheck if code changed after the last recorded verification**

Run:

```powershell
cd D:\architect-workspace\architect-saas
npm run typecheck
npm run lint
npm run build
npm run deps:audit
npx prisma validate
npm run data:doctor
```

Expected:

- All commands exit `0`.
- Existing warning-only lint hook or data-guard messages may be recorded as warnings only.
- Any failure stops the closeout until the cause is assigned as code, data, environment, or missing account setup.
- The worker compares the inspected deployment commit SHA with the latest recorded verification SHA. If the SHA differs, is newer than the last known green Step 11 baseline, or cannot be mapped confidently, run the full local recheck instead of relying on historical results.

- [ ] **Step 3: Run the automated Preview API probe only with approved Preview test data**

Set environment variables in the shell without printing values:

```powershell
cd D:\architect-workspace\architect-saas
$env:PREVIEW_BASE_URL = "https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app"
npx tsx scripts/preview-collaboration-api-probe.ts
```

If Vercel Preview Authentication is enabled and a temporary share URL has been intentionally created, set `VERCEL_SHARE_URL` in the shell without logging the URL body.

Required environment names, without values:

```text
PREVIEW_BASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Optional environment names, without values:

```text
VERCEL_SHARE_URL
PREVIEW_PROJECT_B_ID
PREVIEW_ADMIN_EMAIL
PREVIEW_MANAGER_EMAIL
PREVIEW_VIEWER_EMAIL
PREVIEW_EDITOR_EMAIL
PREVIEW_PENDING_EMAIL
PREVIEW_NO_ACCESS_EMAIL
```

Expected:

- Exit code `0`.
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` point only at the intended Preview Supabase project. Stop if the target appears to be Production or cannot be classified.
- The probe uses Supabase Admin-generated magic-link/OTP flow in process memory. Do not print, paste, inspect, or store the service-role key, generated link, OTP token hash, cookies, or auth session payload.
- Probe cleanup removes probe tasks.
- Output includes PASS for viewer identity, viewer member names/emails, viewer read-only task denial, editor create, editor manager-route denial, manager route, edit lease conflict, different-field lease, manager manager-invite denial, manager manager-request denial, pending/no-access inventory denial, and admin access-request listing.
- This does not replace final real Google OAuth provider UI verification.

- [ ] **Step 4: Verify browser-rendered role and collaboration matrix**

Use distinct browser sessions or profiles for:

```text
global admin
project manager
project editor
project viewer
pending or no-access user
invited user before acceptance
invited user after acceptance
rejected request user
```

Expected browser checks:

- Viewer can open board, daily, calendar, trash read surfaces.
- Viewer can see project member names and email addresses.
- Viewer cannot create, update, reorder, delete, restore, permanently delete tasks, upload files, version files, trash files, restore files, or delete files.
- Viewer can download an authorized signed file.
- Viewer cannot download unauthorized files.
- Editor can create, update, reorder, and trash tasks, and upload/version files.
- Editor cannot invite, approve access requests, or manage membership.
- Manager can invite `viewer` and `editor`.
- Manager cannot invite, grant, revoke, or approve `manager`.
- Manager can approve requests only as `viewer` or `editor`.
- Admin can approve, grant, and revoke `manager`.
- Pending user cannot list projects or access normal workspace APIs.

- [ ] **Step 5: Verify invitation and access-request positive paths**

Expected:

- Invited Google user without an app profile can accept a valid invitation.
- Invitation acceptance creates or activates the app profile before normal app guards are required.
- Accepted invitation creates membership with the invitation role.
- Wrong Google email cannot accept the invitation.
- Revoked invitation cannot be accepted.
- Expired invitation cannot be accepted when an expired fixture is available.
- Pending user can submit the allowed access request type.
- Manager approval of a `viewer` request creates only `viewer` membership and records audit/history.
- Manager approval of an `editor` request creates only `editor` membership and records audit/history.
- Admin approval of a `manager` request creates only `manager` membership and records audit/history.
- Rejected request keeps audit history and does not create membership.

- [ ] **Step 6: Verify two-session collaboration behavior**

Use at least two simultaneous sessions in the same project.

Expected:

- Session A changes a task; session B sees refresh or loaded-scope update.
- Session A uploads or changes a file; session B sees file data refresh.
- Session A opens the project; session B sees project presence.
- Session A selects a task; session B is not blocked from editing.
- Session A enters inline edit mode for one field; session B sees active editor context.
- Session B cannot enter edit mode for the same task field while session A holds the lease.
- Session B can enter edit mode for a different field when field-level leasing is used.
- Session A save or cancel releases the lease.
- Stale lease expires after heartbeat stops or the holder leaves long enough for TTL expiry.

- [ ] **Step 7: Run final real Google OAuth provider check**

This is user-assisted unless the user explicitly provides an interactive browser identity path.

Expected:

- Clean browser profile or incognito can pass Vercel Preview Authentication if enabled.
- `/login` starts Google OAuth.
- Google redirects back to the Preview root `/auth/callback`.
- The app routes through `/auth/post-login`.
- Admin, manager, and pending/no-access outcomes match their roles.
- Unsafe external `next` redirect is not accepted.

- [ ] **Step 8: Record Step 11 closeout**

Write the collaboration closeout worklog with:

```text
Preview URL
deployment id
commit SHA
accounts/roles used without passwords or tokens
API probe result
browser matrix result
Google OAuth provider result or explicit user-owned remaining check
failed checks with route/surface, cause class, owner, and next action
```

Expected:

- Step 11 can be marked closed only if API probe, browser role/access checks, invitation/access positive paths, two-session collaboration checks, and final Google OAuth provider check are all recorded.
- If real Google OAuth remains user-owned, Step 11 stays open with a single owner and exact checklist.

## Task 3: Close Verified-Legal Preview Boundary Without Leaking Secrets

**Files:**
- Read: `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-17-verified-legal-r2-preview-env-refresh.md`
- Read: `D:/architect-workspace/architect-saas/docs/superpowers/plans/2026-06-09-cross-project-boundary-and-integration-plan.md`
- Read: `D:/architect-workspace/architect-saas/docs/superpowers/plans/2026-06-09-verified-legal-centralization-plan.md`
- Modify: `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-18-verified-legal-preview-closeout.md`

- [ ] **Step 1: Confirm alias-to-deployment mapping**

Run:

```powershell
cd D:\architect-workspace\architect-saas
npx vercel inspect https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --scope chois-projects-7b2948cf
```

Expected:

- The canonical alias resolves to the intended current Preview deployment.
- Record both the canonical alias deployment id and the deployment id recorded in the 2026-06-17 verified-legal R2 Preview env refresh worklog. Do not claim they match unless the inspected alias proves it.
- If it still resolves to an older deployment while the 2026-06-17 R2 refresh worklog references a newer direct deployment, stop and report the mismatch. Do not change aliases without explicit approval.

- [ ] **Step 2: Confirm env shape without values**

Run:

```powershell
cd D:\architect-workspace\architect-saas
npx vercel env ls --scope chois-projects-7b2948cf
```

Expected:

- Preview/branch-scoped env names include `VERIFIED_LEGAL_EVIDENCE_API_URL`, `VERIFIED_LEGAL_EVIDENCE_API_SECRET`, and `VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET`.
- `LAW_OPEN_DATA_OC` is absent from `architect-saas`.
- The worker records only env names and target environment/scope, never values.
- Do not use `vercel env pull`, `vercel env get`, debug logs, pasted env output, or local `.env` files to capture secret values.
- Distinguish project-wide env visibility from branch-scoped Preview proof.

- [ ] **Step 3: Verify Preview route reachability**

Run unauthenticated first:

```powershell
curl.exe -I -L https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/preview/daily
```

Expected:

- HTTP `200` means the route is publicly reachable.
- HTTP `401` with Vercel Authentication means deployment protection is active; this is not an app failure.
- Record status, final URL, deployment id/target when available, and a minimal non-sensitive marker only. Do not paste response bodies, request headers, cookies, signed URLs, authorization headers, or bypass tokens.

If Vercel Authentication is active, use authenticated Vercel access:

```powershell
npx vercel curl /preview/daily --deployment https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --scope chois-projects-7b2948cf
```

Expected:

- Authenticated Vercel fetch returns HTTP `200`.
- The closeout separates Vercel protection from app auth.

- [ ] **Step 4: Run local centralization validators**

Run:

```powershell
cd D:\architect-workspace\architect-saas
npm run ai-review:readiness
npm run task-review:validate
npm run project-context:validate
npm run legal-search:validate
npm run legal-batch-audit:validate
npm run typecheck
npm run lint
```

Expected:

- `ai-review:readiness` requires `DATABASE_URL`, `VERIFIED_LEGAL_EVIDENCE_API_URL`, and `VERIFIED_LEGAL_EVIDENCE_API_SECRET`.
- SaaS does not require `LAW_OPEN_DATA_OC`.
- Task-review keeps WIKI approval untouched and does not auto-create or auto-approve WIKI.
- Project context stays separate from legal evidence.

- [ ] **Step 5: Run authenticated completion smoke only if the cookie is intentionally provided**

Do not inspect browser/session stores to obtain a cookie. Do not print the cookie.

This smoke is not read-only. It creates app data, calls retrieve/task-review/records routes, and then cleans up probe tasks. In a plan/worklog-only closeout, skip this step even if `ARCHITECT_SMOKE_COOKIE` is available unless the user separately approves Preview smoke-data writes.

When the user has intentionally made `ARCHITECT_SMOKE_COOKIE` available in the shell, run:

```powershell
cd D:\architect-workspace\architect-saas
npm run ai-review:completion-smoke -- -Origin https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app -Cleanup
```

Expected JSON fields:

```json
{
  "status": "passed",
  "auth": 200,
  "createVisibleOnServerReadback": true,
  "taskReviewStatusCode": 200,
  "taskReviewPreviewWikiApprovalAttempted": false,
  "taskReviewPreviewCandidateCreated": false,
  "savedAssistantExecutionMode": "local-chatgpt-codex",
  "savedAssistantRuntimeMode": "extension-native-bridge-in-page",
  "wikiCandidateState": "candidate",
  "cleanup": true
}
```

Expected:

- `editProof` has three entries and each has `serverReadback: true`.
- If `ARCHITECT_SMOKE_COOKIE` is not intentionally available, record this as an explicit skip that is not a Preview closeout blocker while Chrome UI proof plus saved-record verification remains the accepted proof path.
- If Preview smoke-data writes are not separately approved, record an explicit skip and do not describe this as a fresh completion-smoke pass.

- [ ] **Step 6: Record verified-legal Preview closeout**

Expected worklog facts:

```text
canonical URL checked
deployment id
env names present/absent without values
route reachability result
validator command results
completion smoke result or intentional skip
no LAW_OPEN_DATA_OC in SaaS
no browser exposure of R2, LAW OPEN DATA, or verified-legal server secrets
Production deferred
```

## Task 4: Close Metadata, Backup/Restore, and Scale Items As Conditional Deferred

**Files:**
- Read: `D:/architect-workspace/docs/operating-plans/legal-corpus-and-wiki-integrated-operations.md`
- Read: `D:/architect-workspace/docs/runbooks/legal-corpus-and-saas-backup-recovery.md`
- Read: `D:/architect-workspace/verified-legal-evidence-api/docs/runbooks/manual-legal-corpus-r2-refresh.md`
- Modify: `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-18-operations-deferred-closeout.md`

- [ ] **Step 1: Record SaaS legal corpus metadata as deferred**

Expected closeout language:

```text
No legal corpus metadata table is required now.
Do not add Prisma schema, migration, or repository changes.
Use R2 current/current.json and verified-legal manifests until a concrete UI/API need appears.
Reopen only if Knowledge Admin active/stale display, SaaS batch audit snapshot queries, multi-instance activation state, or restore/compliance history needs DB-visible metadata.
Supabase must not store full corpus bodies, raw payload bodies, full active-index artifacts, or historical snapshot bodies.
```

- [ ] **Step 2: Run read-only/recovery validators where credentials are already configured**

In `verified-legal-evidence-api`, run only non-mutating checks:

```powershell
cd D:\architect-workspace\verified-legal-evidence-api
npm run backup:recovery:validate
npm run r2:recovery-report
npm run r2:runtime-gate
npm run r2:security-gate
```

Expected:

- Recovery report verifies current pointer, immutable manifest, artifact existence, byte sizes, and SHA-256 digests.
- Runtime gate proves current active-index load and warm searches without repeated full artifact reads.
- Security gate proves public unauthenticated access denial and read-token write denial if configured.
- Output recorded in closeout contains snapshot id, counts, digest status, and command names only.
- `r2:security-gate` must run with read credentials only for this closeout. Stop if it requires write credentials or if any canary/object write unexpectedly succeeds.
- Recovery reports validate recoverability only; they are not restore drills, rollback completion, SaaS DB recovery, or approval to move `current/current.json`.

- [ ] **Step 3: Record SaaS backup boundary**

Run only after confirming the target is local/non-Production and not cloud-connected, unless the user explicitly approved a cloud data operation:

```powershell
cd D:\architect-workspace\architect-saas
npm run data:backup
```

Expected:

- Local snapshot id may be recorded.
- Cloud backup id is recorded only as present/null, never with credentials or DB URLs.
- Do not run `npm run data:restore`.
- Do not run cloud DB export/restore.
- If the target is Production, cloud-connected, or cannot be classified, skip `npm run data:backup`, record the boundary, and keep the restore/backup operation approval-gated.

- [ ] **Step 4: Record restore operations as approval-gated**

Expected closeout language:

```text
R2 rollback is a current-pointer write and requires explicit approval.
SaaS local restore requires a selected local snapshot id and explicit approval.
Cloud/Production DB restore requires explicit approval, rollback or forward-fix plan, and post-restore validation.
R2 rollback is not a SaaS DB rollback.
SaaS DB restore is not an R2 corpus rollback.
```

- [ ] **Step 5: Record paid/scale expansion as not justified**

Expected closeout language:

```text
No paid/scale expansion is implemented now.
Reopen only when Supabase/R2 quotas, active-index cold-start/reload time, memory, concurrency, retrieval quality, or legal refresh cadence creates measured pressure.
Keep active-index interface stable.
Do not add pgvector, D1/Postgres active-index tables, embeddings, scheduler/Cron, or paid-plan assumptions in this closeout.
```

## Task 5: Keep Production Resume Gate Separate

**Files:**
- Read: `D:/architect-workspace/architect-saas/docs/2026-04-24-release-readiness-signoff.md`
- Read: `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-11-production-deferral-closeout.md`
- Optional modify: `D:/architect-workspace/architect-saas/docs/worklogs/2026-06-18-saas-open-items-closeout.md`

- [ ] **Step 1: Confirm Production remains gated**

Expected:

- Production root URL is still not assumed.
- Production-only Vercel env vars are not configured or not verified.
- Production verified-legal API target/secret parity is not verified.
- Production OAuth/canonical host is not verified.
- Browser Assistant signed release path is not verified.
- Authenticated production smoke is not run.

- [ ] **Step 2: Record explicit non-actions**

The closeout must say no worker performed:

```text
Production Vercel env changes
Production deployment
Production alias promotion
Production DB migration, seed, bootstrap, backup, restore, or data write
Production Supabase Auth or Google OAuth callback changes
Chrome Web Store upload
native-host signing
scheduler/Cron enablement
full production corpus refresh
pgvector/embedding scale-up
```

Expected:

- Production remains open only in the Production resume gate.
- Preview closeout is not described as Production readiness.

## Task 6: Final Plan Closeout And Review

**Files:**
- Modify: closeout worklog created in Task 1
- Optional modify: stale active plan checkboxes only after evidence is recorded

- [ ] **Step 1: Run documentation hygiene checks**

Run:

```powershell
cd D:\architect-workspace\architect-saas
git diff --check
npm run worklog:check
```

Expected:

- No whitespace errors.
- If changes are staged for commit, at least one compact worklog under `docs/worklogs/` is staged.

- [ ] **Step 2: Read-only reviewer pass**

`ul` reviews:

```text
No secret values in docs.
No Production action implied as completed.
No DB/R2 write implied as executed unless exact approval and evidence exist.
No raw payload archival described as implemented.
No legal corpus metadata table described as implemented.
No paid/scale expansion described as implemented.
No stale alias/deployment mismatch ignored.
```

Expected:

- Any issue is corrected in documentation before final report.

- [ ] **Step 3: Final report**

Report:

```text
plan file path
worklog path
which items are closed by verification
which items are closed as conditional deferred
which items remain Production-gated
commands run and result
commands intentionally not run and why
open blockers with owner
```

## Stop Rules

- Stop before any Vercel env change, redeploy, alias change, or deployment protection change.
- Stop before any Production action.
- Stop before any DB migration, seed, bootstrap, restore, cloud backup, or data write.
- Stop before any R2 `--write`, `r2:restore-current`, current-pointer movement, snapshot deletion, retention operation, raw payload archival write, or public bucket policy change.
- Stop before adding `legal_corpus_metadata` schema, Prisma migration, repository, or UI.
- Stop before adding pgvector, embeddings, D1/Postgres active-index tables, scheduler/Cron, Web Store upload, or native-host signing.
- Stop if `LAW_OPEN_DATA_OC` is required by or added to `architect-saas`.
- Stop if a worker needs to print, paste, or inspect secret values, cookies, DB URLs, signed URLs, `OC=` URLs, `.env` content, or authorization headers.
- Stop if the canonical Preview alias points to an unexpected deployment.
- Stop if required Preview accounts or fixtures are missing; record missing setup instead of mutating baseline data.
- Stop if Google OAuth provider verification has not been performed; keep Step 11 open with a user-owned checklist instead of calling it closed.

## Execution Handoff

Recommended: Subagent-Driven.

- `hy`: Execute Task 2 only.
- `ung`: Execute Task 3 only.
- `ul`: Execute Task 4 and final read-only review.
- `choi`: Execute Task 1, Task 5, Task 6, reconcile outputs, and write the final report.

Inline execution is acceptable if each task is completed in order and the stop rules are enforced before any external mutation.
