# Daily Edit Lease Bug-Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Keep the checkbox state updated as work proceeds. For multi-file implementation, also use `superpowers:subagent-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion`.

**Goal:** Prevent the Preview `/daily` page from showing a full-page crash when a user selects an existing task and starts editing, while preserving the spreadsheet-like `/daily` local-first behavior.

**Architecture:** The likely failure boundary is `POST /api/edit-leases`, not the broad `/daily` task read/write path. The route touches `edit_leases` through Prisma and currently maps only one conflict class (`P2002`) to a controlled response; other runtime DB/schema/permission/transaction failures can become opaque 500 responses. The client must treat lease acquisition as a recoverable collaboration affordance, not as a reason for the entire surface to crash or become unusable. No fix may force a full dashboard refresh, globally disable editing, or wait for server acknowledgement before showing normal local edit state.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, PostgreSQL/Supabase, Vercel Preview deployments, existing repo verification scripts.

---

## 2026-06-10 OLD/Covered Notice

- [x] This plan is historical for the earlier Preview edit-lease crash investigation.
- [x] Current `/daily` release readiness is tracked in `2026-06-08-daily-cell-document-collaboration-plan.md`.
- [x] The current exact Preview proof covers create latency, stuck sync state, navigation while sync is pending, and two-window collaboration on `/daily`.
- [ ] Reopen this plan only if the specific `POST /api/edit-leases` crash class returns on the exact active Preview or Production URL.

## Context

User-visible issue:

- Exact reported route: `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily`
- Symptom: selecting an existing task and attempting to edit on the Preview deployment can lead to a browser-level Next/Vercel error page: "This page couldn't load".
- Important correction: local server behavior is not the target. All final proof must use the exact Preview route or the exact deployment behind that route.

Evidence from prior read-only diagnosis in this thread:

- The failing path is associated with `POST /api/edit-leases` returning 500 on Preview.
- Normal task endpoints did not show the same broad outage signal.
- The build/deploy migration gate being clean does not prove the runtime Preview Prisma client is pointing at the same database URL used by the migration gate.
- The `edit-leases` route uses Prisma write operations against `edit_leases`; errors other than expected lease conflicts are currently too generic for Preview diagnosis.

Read-only multi-agent inputs used to form this plan:

- Code-review explorer: highest-risk change area is `src/app/api/edit-leases/route.ts`, followed by shared route error classification and client lease-failure handling.
- Data/runtime explorer: likely error classes include Prisma `P2021`, `P2022`, `P2028`, `P2034`, `P2025`, `P2003`, SQLSTATE `42501`, `22P02`, `40001`, `40P01`, and unexpected adapter wrapping of `P2002`.
- Plan/worktree explorer: add one unique plan file under `docs/superpowers/plans`; do not touch code in this planning turn; future implementation should stage exact pathspecs because the current workspace has unrelated dirty files.

Local and web skill/content search inputs:

- Required local skills used for this plan: `harness-engineering`, `superpowers:using-superpowers`, `find-skills`.
- Supporting local skills reviewed: `superpowers:writing-plans`, `superpowers:subagent-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `superpowers:requesting-code-review`, `coderabbit:code-review`, `protect-data`, `supabase-postgres-best-practices`.
- `npx skills find "code review"` found community code-review skills, but none should be installed during diagnosis without explicit approval.
- `npx skills find "data database postgres prisma"` found Prisma and Vercel storage related skills. They are useful discovery signals, but this repo already has enough Prisma/Supabase/Vercel local knowledge to plan safely.
- `coderabbit` CLI was not available locally. Do not install or run it without explicit user approval; for this bug, run the repo-local review flow first because the plan has no implementation diff yet.

Primary external references checked:

- Prisma error reference: `https://www.prisma.io/docs/orm/v6/reference/error-reference`
- Prisma exception handling: `https://www.prisma.io/docs/orm/v6/prisma-client/debugging-and-troubleshooting/handling-exceptions-and-errors`
- Vercel logs CLI: `https://vercel.com/docs/cli/logs/`
- Next.js App Router error handling: `https://nextjs.org/docs/app/getting-started/error-handling`
- Supabase Postgres connection/pooler docs: `https://supabase.com/docs/guides/database/connecting-to-postgres`
- Supabase RLS docs: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Skills registry docs: `https://skills.sh/docs`

---

## Non-Goals And Guardrails

- Do not modify code while executing this plan file creation task.
- Do not run DB writes, migrations, `db push`, lease cleanup, task creation probes, Vercel deploys, alias changes, or environment changes without fresh explicit approval.
- Do not print secrets or database URLs. Report only env var names, boolean presence, and sanitized error codes.
- Do not use broad staging commands such as `git add docs`.
- Do not fix this by disabling the table, adding a global pending flag, forcing a full refresh, or waiting for lease server acknowledgement before allowing normal local edit state.

---

## Current Worktree And Merge Safety

Known state at plan creation:

- Branch: `codex/multi-user-transition`
- Worktree: single worktree at `D:/architect-workspace/architect-saas`
- Existing unrelated dirty paths:
  - `AGENTS.md`
  - `codex/skills/harness-engineering/SKILL.md`
  - `codex/skills/harness-engineering/agents/openai.yaml`
  - `docs/runbooks/`
  - `docs/worklogs/2026-06-05-1037-harness-engineering-operating-modes.md`

Merge-safety conclusion:

- Adding this unique file under `docs/superpowers/plans/` is low conflict risk.
- Future bug-fix implementation should happen on a separate branch or worktree if the user still has unrelated edits in this checkout.
- If continuing from this same checkout, stage only exact pathspecs for implementation and do not stage the user's unrelated edits.

Preflight commands for the implementation turn:

```powershell
git status --short --branch
git worktree list
git status --porcelain -- docs/superpowers/plans docs/worklogs src scripts prisma
git rev-parse HEAD
```

If creating a separate implementation worktree:

```powershell
git fetch origin
git worktree add ..\architect-saas-daily-edit-lease-bug-fix -b codex/daily-edit-lease-bug-fix codex/multi-user-transition
Set-Location ..\architect-saas-daily-edit-lease-bug-fix
git status --short --branch
```

---

## Task 0: Exact Preview Evidence Lock

Files:

- No code files initially.
- Optional evidence note in `docs/worklogs/` only after implementation begins.

Steps:

- [ ] Confirm the exact Preview route and alias target before changing anything:

```powershell
npx vercel inspect https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --logs
```

- [ ] Check only read-only deployment/runtime facts: deployment id, commit SHA, readiness, last `POST /api/edit-leases` 500 timestamp, and whether the alias still points to the intended deployment.
- [ ] Use Vercel logs filtering from the official CLI docs for targeted error collection:

```powershell
npx vercel logs https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app --since 2h --status-code 500 --json
```

- [ ] In an authenticated browser session, reproduce only the UI path: open exact `/daily`, select an existing task, enter an editable cell, and record whether the failed request is `POST /api/edit-leases`.
- [ ] Capture only sanitized response data: status, JSON `code`, JSON `debug.code`, JSON `debug.meta.code`, table/constraint names, and timestamp. Do not copy cookies, authorization headers, or raw secrets.
- [ ] If the failure is not `POST /api/edit-leases`, stop this plan and write the corrected failing route before implementing.

Expected result:

- The implementation starts from an exact route/error-class hypothesis, not from local-server behavior or a stale alias assumption.

---

## Task 1: Add Failing Regression Coverage Before The Fix

Files:

- `scripts/daily-editing-responsiveness-verify.ts`
- `scripts/preview-collaboration-api-probe.ts`
- New or existing focused route test file if the repo already has an API route test pattern.

Steps:

- [ ] Extend the static verifier so it checks `src/app/api/edit-leases/route.ts` for route duration, target UUID validation, bounded cleanup behavior, and explicit Prisma error handling.
- [ ] Extend the route/API verifier to assert that Prisma schema/runtime failures do not become an unclassified generic 500 without sanitized debug metadata.
- [ ] Add coverage for these error classes:
  - `P2021` table missing
  - `P2022` column missing
  - `P2028` transaction closed/failed
  - `P2034` transaction conflict
  - `P2025` stale row
  - `P2003` foreign key failure
  - SQLSTATE `42501` permission/RLS denial
  - SQLSTATE `22P02` invalid UUID
  - SQLSTATE `40001` serialization failure
  - SQLSTATE `40P01` deadlock
- [ ] Add a UI-level regression check where `POST /api/edit-leases` returns 500 HTML or malformed JSON and `/daily` remains on the app surface without a full-page crash.
- [ ] Extend `scripts/preview-collaboration-api-probe.ts` only for richer diagnostics unless the user approves write probes. The probe currently creates/deletes resources, so default to read-only inspection in this bug plan.

Acceptance criteria:

- There is at least one failing or newly meaningful check proving the current behavior is under-specified before implementation.
- The tests protect against both server-side unclassified DB errors and client-side HTML/error JSON parsing failures.

---

## Task 2: Harden `POST /api/edit-leases`

Files:

- `src/app/api/edit-leases/route.ts`
- `src/lib/api/route-error.ts`
- Potentially `src/lib/api/errors.ts` or the local API error helper used by this route, if the repo already centralizes API errors.

Steps:

- [ ] Add an explicit route duration export if compatible with the app's Vercel runtime conventions:

```ts
export const maxDuration = 30;
```

- [ ] Validate `targetId` as a UUID before any Prisma query. Invalid IDs should return a controlled 400 with a stable code, not reach PostgreSQL as `22P02`.
- [ ] Review whether expired-lease cleanup should run before every lease acquisition. Prefer bounded best-effort cleanup scoped by project and lease type, or move global cleanup out of the critical edit-entry path.
- [ ] Wrap cleanup so cleanup failure does not block acquisition unless the failure proves the lease table itself is unusable.
- [ ] Map expected contention and transaction classes to controlled responses:
  - `P2002`, `P2034`, `40001`, `40P01`: return conflict/retryable response, not crash.
  - `P2025`: retry acquisition once or treat as conflict with a retry hint.
  - `P2028`: return 503 or retryable server error with sanitized code.
- [ ] Map schema/runtime DB classes to useful Preview-safe error codes:
  - `P2021`, `P2022`: `DATABASE_SCHEMA_UNAVAILABLE` or equivalent 503.
  - `42501`: `DATABASE_PERMISSION_DENIED` or equivalent 503/403 based on existing API semantics.
  - `P2003`: controlled constraint response with table/constraint metadata only if sanitized.
- [ ] Log unexpected non-connectivity Prisma errors server-side with sanitized fields. Do not log request cookies, full database URLs, raw SQL with values, or secret-bearing env vars.

Acceptance criteria:

- Any expected `edit_leases` schema, permission, transaction, conflict, or invalid-input failure returns a controlled JSON response.
- Vercel Preview logs contain enough sanitized server-side context to identify the Prisma/SQL class.
- The route no longer has an unbounded global cleanup as a prerequisite for entering edit mode.

---

## Task 3: Make Lease Failure Recoverable In The Client

Files:

- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/task-grid-shared.ts`
- `src/components/tasks/daily-grid-row-v2.tsx`
- Any existing task toast/status helper used by `/daily`.

Steps:

- [ ] Find the lease acquisition helper and response parser used before inline editing.
- [ ] Ensure non-JSON and HTML 500 responses are parsed defensively. A failed `response.json()` must not throw into React render or navigation.
- [ ] Treat 409 lease conflict as collaboration contention: keep the app usable and show a localized, non-modal message.
- [ ] Treat 500/503 lease infrastructure failure as degraded collaboration mode. The user should remain on `/daily`; decide whether to allow local edit without a lease or to keep the cell selected with a retry prompt based on existing product behavior.
- [ ] Do not introduce one global pending flag such as `disabled={isSaving}` that blocks the full table after one lease request.
- [ ] Dedupe editable-column logic between `src/components/tasks/task-grid-shared.ts` and `task-workspace.tsx`; reconcile the known `calendarLinked` mismatch so client-side column decisions do not route invalid field edits into the lease API.

Acceptance criteria:

- A failed lease request cannot produce a full-page crash.
- Chained `/daily` interactions still work: select row, edit cell, move selection, edit another row, and continue without reload.
- The fix preserves the local-first spreadsheet invariant from `AGENTS.md`.

---

## Task 4: Verify Runtime Data Shape Read-Only

Files:

- No code files by default.
- Optional one-off diagnostic script only if current repo patterns already support sanitized read-only DB diagnostics and the user approves using Preview DB credentials.

Steps:

- [ ] Confirm Preview env var names only; do not print values:

```powershell
npx vercel env ls preview
```

- [ ] Confirm whether runtime Prisma uses `DATABASE_RUNTIME_URL`, rewritten `DATABASE_URL`, transaction pooler, or direct DB URL. Compare `scripts/deploy-migration-gate.ts` with `src/lib/prisma.ts`; migration-clean build logs are not enough if those paths can target different URLs.
- [ ] Run only read-only SQL against the exact Preview runtime DB after confirming the target:

```sql
select migration_name,
       finished_at is not null as applied,
       rolled_back_at is null as not_rolled_back
from _prisma_migrations
where migration_name = '202604290004_add_edit_leases';

select to_regclass('public.edit_leases') is not null as edit_leases_exists;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'edit_leases'
order by ordinal_position;

select conname, contype
from pg_constraint
where conrelid = 'public.edit_leases'::regclass;

select count(*) as total,
       count(*) filter (where expires_at <= now()) as expired
from public.edit_leases;

select count(*) as orphan_task_leases
from public.edit_leases l
left join public.tasks t
  on l.target_type = 'taskField'
 and t.project_id = l.project_id
 and t.id = l.target_id
where l.target_type = 'taskField'
  and t.id is null;

select relrowsecurity, relforcerowsecurity
from pg_class
where oid = 'public.edit_leases'::regclass;
```

- [ ] If the schema is missing or wrong, stop and ask for approval before any migration, grant, RLS, cleanup, or data repair.
- [ ] If the schema is correct, continue with API/client hardening and classify the actual runtime error from logs.

Acceptance criteria:

- The team knows whether the bug is caused by DB schema drift, DB permission/RLS, runtime URL mismatch, or app-level error handling.
- No Preview data is mutated during diagnosis.

---

## Task 5: Review And Validation

Files:

- All changed implementation files from Tasks 1-4.
- `docs/worklogs/2026-06-05-daily-edit-lease-bug-fix.md` after implementation only.

Steps:

- [ ] Run focused validators first:

```powershell
npx tsx scripts/daily-editing-responsiveness-verify.ts
npx prisma validate --schema prisma/schema.prisma
```

- [ ] Run normal repo validation appropriate for the final diff:

```powershell
npm run lint
npx tsc --noEmit --incremental false
npm run build
git diff --check
```

- [ ] Use `superpowers:requesting-code-review` or the repo's equivalent review flow after the implementation diff exists. Include these review questions:
  - Can any `POST /api/edit-leases` failure still surface as a full-page crash?
  - Are Prisma/SQL errors classified without leaking secrets?
  - Did the fix preserve continuous `/daily` editing without global blocking?
  - Did any data/DB operation require approval that was not obtained?
- [ ] Do not use CodeRabbit CLI unless it is already available or the user approves installing/authenticating it.
- [ ] After deployment, verify the exact Preview URL, not localhost:
  - `/preview/daily` for light smoke.
  - `/daily` for authenticated DB-backed behavior.
  - Existing task selection and inline edit.
  - Browser network: `POST /api/edit-leases` returns controlled JSON on failure and never an app-crashing HTML response.
  - Browser console: no uncaught React/Next error.
- [ ] Write a concise worklog after the implementation is verified:

```text
Req: Fix Preview /daily crash when editing existing task.
Diff: Summarize exact changed files from staged diff.
Why: edit_leases failures are now classified and recoverable in client.
Verify/Time: List exact commands and exact Preview URL evidence.
```

Acceptance criteria:

- Local validation passes.
- Exact Preview `/daily` no longer crashes on the reported interaction.
- Any remaining risk is explicit and tied to evidence, not speculation.

---

## Stop Conditions

Stop and ask the user before proceeding if any of these are true:

- A DB write, migration, grant, RLS change, cleanup, or Preview data probe is needed.
- Vercel deploy, alias change, env var change, or auth/profile change is needed.
- The exact Preview URL points to a different deployment than expected and an alias repair is needed.
- The failure is not connected to `POST /api/edit-leases`.
- The fix requires changing `/daily` local-first optimistic behavior beyond lease-specific degradation.
