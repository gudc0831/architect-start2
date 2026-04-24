# Multi-User Transition Plan

- Updated: 2026-04-24
- Parent index: [../PLAN.md](../PLAN.md)
- Latest follow-up execution plan: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)
- Locked auth and RBAC decisions: [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
- Deployment guardrails: [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)
- Supporting setup: [SUPABASE_MIGRATION.md](SUPABASE_MIGRATION.md)
- Deployment sequencing: [2026-04-07-predeploy-implementation-plan.md](2026-04-07-predeploy-implementation-plan.md)

## Purpose

This document is the implementation plan for moving the project from the current single-user oriented flow to a project-scoped multi-user cloud flow.

Use this file for:

- implementation order
- file ownership and entry points
- phase boundaries
- verification expectations

Do not use this file to reopen already locked auth or RBAC decisions. Those live in [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md).

## Current Security Inputs

Current release-relevant findings are tracked in [2026-04-10-security-deployment-review.md](2026-04-10-security-deployment-review.md).

The findings that must shape execution order are:

- project authorization bypass in project list and rename flows
- open redirect in the login `next` flow
- missing request-integrity checks on cookie-authenticated mutation routes
- vulnerable release dependencies and missing GitHub security automation
- missing header baseline and public diagnostics exposure

Do not treat these as side notes. They are active execution inputs for phase ordering.

## Phase 1 Scope

Phase 1 includes:

- Google OAuth login in cloud mode
- SSR callback and post-login landing handling
- pre-provisioned profile and membership gating
- global admin plus project `manager/member` role split
- membership-filtered project list and project selection
- project-scoped API guards
- policy-backed security boundary planning for browser-facing data and storage access
- assignee linkage foundation
- concurrency hardening for task create, reorder, and file version creation

Phase 1 does not include:

- `viewer/editor` roles
- open self-signup
- local-mode parity as proof of correctness
- full real-time collaboration

## Status As Of 2026-04-24

Completed and should not be reworked unless a regression appears:

- Phase 0 preview/test environment readiness for the current preview path
- Phase 1 identity and provisioning path for Google OAuth preview login
- Phase 2 membership-filtered project access baseline
- Phase 3 shared route guard and request-integrity baseline for the verified routes
- preview manager/member/no-access auth verification baseline
- GitHub branch protection and required-check baseline
- Vercel Preview Authentication restore and preview env separation

Still active before Phase 1 can be called complete:

- Phase 4 database and storage policy boundary
- Phase 5 assignee-to-profile linkage foundation
- Phase 6 concurrency hardening
- Phase 7 conflict recovery UX and final release readiness pass

Current active work order:

- [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)

## Read Order For Implementers

1. [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
2. this file
3. [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)
4. [SUPABASE_MIGRATION.md](SUPABASE_MIGRATION.md)
5. [2026-04-07-predeploy-implementation-plan.md](2026-04-07-predeploy-implementation-plan.md)

## Working Rules

- `cloud` mode is the only accepted correctness target for multi-user auth and RBAC.
- `local` mode may be used to shape code, schema, and UI, but not to sign off on access control.
- `preview + test Supabase` is the primary validation environment.
- Production is the final confirmation environment, not the main development test bed.
- Private-repo release safety is enforced with branch protection and required checks, not by assuming GitHub environment reviewers are available.
- Any browser-facing storage or data access path must have matching RLS or storage policy protection before sign-off.

## Phase Breakdown

### Phase 0. Preview And Test Environment Readiness

Status:

- complete for the current preview path as of 2026-04-23
- do not recreate preview accounts, `preview-rbac-b`, branch protection, or preview env separation unless a regression appears

Goal:

- Prepare the environment required to verify real multi-user behavior before feature rollout.

Primary work:

1. Create or confirm separate `preview/test` and `production` Supabase projects.
2. Configure allowed redirect URLs for:
   - localhost development
   - preview deployments
   - the exact production site URL
3. Establish the private-repo deployment baseline from [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md):
   - protected production branch
   - required checks
   - Vercel environment separation
4. Add the security automation baseline:
   - CodeQL
   - Semgrep
   - dependency scan or audit
   - Dependabot configuration
5. Patch release-critical dependency advisories before external rollout, starting with the active Next.js line.
6. Prepare at least three cloud test accounts.
7. Prepare at least two projects with different membership sets.
8. Confirm Google OAuth callback URLs for preview and production.

Main files or systems to check:

- `docs/SUPABASE_MIGRATION.md`
- `.env.example`
- Supabase dashboard settings
- Vercel environment settings

Exit criteria:

- three test accounts can authenticate
- preview callback works
- test projects and memberships are ready for validation
- protected-branch and required-check baseline is documented for the active production branch
- preview and production deployments do not share Supabase credentials
- security automation jobs exist or are explicitly queued as the next release prerequisite

### Phase 1. Identity And Provisioning Path

Status:

- complete for the verified preview path
- keep the password route as a controlled utility only, as documented in the worklogs

Goal:

- Replace the current cloud password-oriented login path with the locked Google OAuth path.

Primary work:

1. Add Google OAuth entry and callback handling for cloud mode.
2. Use the SSR or cookie-based PKCE path:
   - browser login trigger with `redirectTo`
   - callback code exchange
   - server-visible session cookies
3. Sanitize post-login redirects:
   - same-site relative paths only
   - safe fallback when invalid
4. Add a stable post-login landing path that avoids prefetch races immediately after callback.
5. Resolve auth user identity via stable provider user id.
6. Enforce the pre-provisioned access rule:
   - successful Google auth does not imply app access
   - app access requires an existing allowed profile and membership, unless the user is global admin
7. Keep the current password route only for local/bootstrap/test utility until the cloud cutover is complete.

Main files:

- `src/app/api/auth/*`
- `src/lib/auth/*`
- `src/lib/supabase/*`
- `src/app/login/page.tsx`
- `src/components/auth/login-form.tsx`
- `prisma/schema.prisma`
- `scripts/bootstrap-admin.ts`

Exit criteria:

- cloud preview login uses Google OAuth
- callback-based session establishment works consistently in preview
- invalid or hostile redirect targets do not escape the site
- users without allowed access do not enter the app
- existing allowed users can sign in and resolve to the correct profile

### Phase 2. Membership-Filtered Project Access

Status:

- complete for the verified preview baseline
- `Project A`/`Project B` manager and member behavior is recorded in [2026-04-20-preview-verification-expansion-matrix.md](2026-04-20-preview-verification-expansion-matrix.md)

Goal:

- Make the selected project and project list membership-aware.

Primary work:

1. Filter project list by membership for non-admin users.
2. Keep `admin` as global bypass across all projects.
3. Treat the selected-project cookie as a UI hint only and re-resolve server-side access on every protected path.
4. Auto-correct stale selected project cookies when the user no longer has access.
5. Move project access checks out of ad hoc route logic and into shared guards.

Main files:

- `src/use-cases/admin/admin-service.ts`
- `src/use-cases/task-project-context.ts`
- `src/use-cases/project-scope-guard.ts`
- `src/lib/project-session.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/select/route.ts`
- `src/app/api/project/route.ts`
- `src/repositories/admin/postgres-store.ts`

Exit criteria:

- a non-member cannot list or select an unrelated project
- stale project selection is corrected safely
- admin can still see all projects

### Phase 3. Route Guard And Role Split

Status:

- complete for the verified manager/admin/member guard and origin-integrity baseline
- optional destructive manager-negative probe remains deferred unless final sign-off requires it

Goal:

- Apply the locked guard hierarchy consistently across server entry points.

Primary work:

1. Introduce and use the guard chain from the auth/RBAC contract.
2. Reclassify APIs by required role:
   - read/write task and file APIs require project access
   - project-scoped admin actions require project manager
   - global admin routes require admin
3. Apply project-manager enforcement to project rename and similar project-scoped mutations.
4. Add request-integrity enforcement for cookie-authenticated mutation routes:
   - strict origin or referer validation
   - or a documented CSRF token contract
5. Remove route-level drift where access depends only on `requireUser()`.

Main files:

- `src/lib/auth/require-user.ts`
- new shared guard helper file if needed
- `src/app/api/admin/**`
- `src/app/api/tasks/**`
- `src/app/api/files/**`
- `src/app/api/project/route.ts`
- `src/app/admin/page.tsx`

Exit criteria:

- each protected route maps to one explicit guard level
- a member cannot perform manager-only project mutations
- a non-member cannot reach project-scoped APIs by direct URL
- mutation routes reject cross-site or invalid-origin requests

### Phase 4. Database And Storage Policy Boundary

Status:

- next active implementation phase

Goal:

- Promote Postgres RLS and Storage policies to the formal long-term security boundary for browser-facing access paths.

Primary work:

1. Identify which tables and operations are browser-reachable now or expected to become browser-reachable.
2. Enable and define RLS policies for those paths using project membership-aware checks.
3. Keep policy checks index-aware and transaction-safe.
4. Define storage object path rules and `storage.objects` policies for upload, read, update, and delete.
5. Restrict `SUPABASE_SERVICE_ROLE_KEY` usage to trusted server-only jobs and privileged maintenance paths.
6. Add negative-path verification for:
   - anonymous user
   - unrelated authenticated user
   - related member
   - related manager
   - global admin

Main files or systems:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- policy SQL files if introduced for Postgres or Storage
- Supabase dashboard SQL editor or migration runner
- `src/storage/supabase-storage.ts`
- `src/app/api/files/**`
- `src/lib/supabase/*`

Exit criteria:

- unrelated authenticated users are denied at the database or storage-policy layer
- browser-facing storage access works only through explicit policy authorization
- service-role access is no longer the assumed default for user-scoped workspace actions

### Phase 5. Assignee To Profile Link Foundation

Status:

- pending after the policy boundary slice

Goal:

- Move task assignment toward actual project members rather than free text only.

Primary work:

1. Add `assigneeProfileId` while keeping legacy assignee text as a display snapshot during transition.
2. Limit selectable assignees to current project members.
3. Define backfill behavior:
   - `email exact match`
   - `displayName exact match`
   - `displayName normalized match`
   - ambiguous or missing matches remain `null`
4. Report unresolved mappings without blocking the whole rollout.

Main files:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- `src/domains/task/types.ts`
- `src/repositories/contracts.ts`
- `src/repositories/postgres/store.ts`
- `src/use-cases/task-service.ts`
- `src/components/tasks/task-workspace.tsx`

Exit criteria:

- assignee choices are project-member scoped
- invalid profile ids are rejected server-side
- unresolved legacy assignees degrade safely

### Phase 6. Concurrency Hardening

Status:

- pending after assignee linkage unless release risk requires pulling it earlier

Goal:

- Close the main write races already visible in the current codebase.

Primary work:

1. Make task number issuance transaction-safe.
2. Add reorder conflict detection instead of last-write-wins sibling order updates.
3. Add unique protection and conflict handling for file group version creation.
4. Return clear `409` responses when concurrent writes conflict.

Main files:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- `src/repositories/contracts.ts`
- `src/repositories/postgres/store.ts`
- `src/use-cases/task-service.ts`
- `src/use-cases/file-service.ts`
- `src/app/api/tasks/reorder/route.ts`

Exit criteria:

- concurrent task create does not produce duplicate numbering
- concurrent reorder does not silently overwrite
- concurrent next-version upload does not create duplicate versions

### Phase 7. Login Outcome UX And Recovery UX

Status:

- partially complete for no-access login outcome
- pending for conflict recovery UX after `409` paths are introduced

Goal:

- Make the new auth and RBAC states understandable to users.

Primary work:

1. Define post-login routing outcomes from the contract doc.
2. Add a dedicated no-access or pending-access screen.
3. Add manager/member/admin safe messaging instead of generic failures.
4. Improve `409` recovery UX for selected task editing and reorder conflicts.

Main files:

- `src/app/login/page.tsx`
- `src/components/auth/login-form.tsx`
- `src/components/layout/*`
- `src/components/tasks/task-workspace.tsx`
- `src/lib/ui-copy/*`

Exit criteria:

- a user with no allowed project does not land in a broken board state
- admin with no project gets a usable setup path
- conflict states guide the user to recover

### Phase 8. Realtime Follow-Up

Goal:

- Add collaborative freshness after correctness is already stable.

Primary work:

1. Add a project-scoped invalidation event model.
2. Start with refresh/revalidate, not fine-grained patch merge.
3. Keep real-time as a follow-up phase after auth, RBAC, and concurrency are stable.

Main files:

- `src/providers/dashboard-provider.tsx`
- `src/providers/project-provider.tsx`
- new real-time helper files if needed

Exit criteria:

- project changes propagate without breaking local draft recovery
- refresh semantics stay consistent with the guard model

## File Ownership Map

- Auth and identity
  - `src/app/api/auth/*`
  - `src/lib/auth/*`
  - `src/lib/supabase/*`
- Project access and membership
  - `src/use-cases/admin/admin-service.ts`
  - `src/use-cases/task-project-context.ts`
  - `src/use-cases/project-scope-guard.ts`
  - `src/repositories/admin/*`
- Task and file authorization
  - `src/app/api/tasks/**`
  - `src/app/api/files/**`
  - `src/use-cases/task-service.ts`
  - `src/use-cases/file-service.ts`
  - `src/use-cases/trash-service.ts`
- Schema and migration
  - `prisma/schema.prisma`
  - `prisma/migrations/*`
- Login and post-login UX
  - `src/app/login/page.tsx`
  - `src/components/auth/login-form.tsx`
  - `src/components/tasks/task-workspace.tsx`
  - `src/lib/ui-copy/*`

## Verification Contract

Minimum preview verification for sign-off:

1. Three cloud accounts
2. Two projects with different membership sets
3. At least one admin, one manager, and one member path tested
4. OAuth callback and post-login routing tested for:
   - preview URL
   - exact production URL
   - no-access state
5. redirect sanitization tested for:
   - absolute external URL rejected
   - protocol-relative URL rejected
   - safe relative path accepted
6. Direct API access tested for:
   - unrelated project selection
   - unrelated task/file access
   - manager-only mutations
   - global admin routes
7. Direct browser or REST access tested for:
   - blocked unauthenticated access
   - blocked unrelated authenticated access
   - allowed related access through matching policy
8. Mutation request-integrity tested for:
   - valid same-site origin
   - invalid origin
   - missing origin or token path according to the chosen contract
9. Conflict scenarios tested for:
   - concurrent task create
   - concurrent reorder
   - concurrent file next-version upload
10. Protected-branch and required-check baseline is active for the production branch used by the repo

## Completion Criteria

Phase 1 is complete only when all of the following are true:

1. Google OAuth is the active cloud login path.
2. Successful login without access does not grant project visibility.
3. Redirect sanitization prevents off-site login bounce behavior.
4. Project list and selected project are membership-scoped for non-admin users.
5. Protected APIs consistently use the shared guard model.
6. Cookie-authenticated mutation routes enforce the chosen request-integrity rule.
7. Browser-facing access paths are backed by matching RLS or storage policy rules.
8. Assignee linkage groundwork exists and fails safely for unresolved legacy data.
9. The main concurrent write paths return correct, recoverable outcomes.
10. Preview verification has been run against real cloud accounts, memberships, and policy boundaries.
