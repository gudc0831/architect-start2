# Deployment Readiness Plan

- Updated: 2026-04-24
- Status: non-production readiness complete; production promotion deferred
- Parent index: [../PLAN.md](../PLAN.md)
- Previous execution record: [2026-04-20-post-preview-execution-plan.md](2026-04-20-post-preview-execution-plan.md)
- Preview verification record: [2026-04-20-preview-verification-expansion-matrix.md](2026-04-20-preview-verification-expansion-matrix.md)
- Deployment guardrails: [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)
- Security review: [2026-04-10-security-deployment-review.md](2026-04-10-security-deployment-review.md)
- Base multi-user plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- RLS and Storage policy draft: [2026-04-24-rls-storage-policy-boundary-design.md](2026-04-24-rls-storage-policy-boundary-design.md)
- Release sign-off checklist: [2026-04-24-release-readiness-signoff.md](2026-04-24-release-readiness-signoff.md)

## Purpose

This is the active work order from 2026-04-24 forward. It replaces the older post-preview checklist as the source of truth for the next deployment preparation pass.

Do not repeat completed preview setup, branch protection setup, or manager/origin verification unless a regression appears.

As of 2026-04-24, all non-production readiness work in this plan is complete or intentionally deferred as optional manual sign-off. Production promotion is out of scope until a production root URL and production-only cloud environment values are provided.

## Conversation Corrections Locked

Use these corrected statements in future handoffs and planning:

- "Preview deployment is ready for testing" means the Vercel Preview deployment exists and can be tested with the intended Preview auth/session path. It does not mean the Preview URL is public or accessible without Vercel Preview Authentication.
- "Latest PR status is clean" and "app-visible Preview header smoke passed" are separate facts. GitHub required checks and Vercel status passed on `dabb052`; the latest app-visible `/login` header smoke recorded here passed on `3199f00` / `dpl_6EzQmCbdjRdMw1J3ghGBzFNbU4UY`.
- Vercel Production env is not production-ready. User-provided screenshots show `APP_BACKEND_MODE=cloud` under Production, but they do not show the required production Supabase/Postgres variables in Project or Shared env.
- The intended production branch flow is working branch or PR Preview to protected `main`, then Production from the protected production branch. The exact Vercel Production Branch setting still requires dashboard confirmation before production promotion.
- "RBAC and multi-user are reflected" means the Phase 1 scope in the auth/RBAC contract: Google OAuth, pre-provisioned access, project-scoped member/manager checks, and global admin bypass. It does not include future `viewer` or `editor` roles, open self-signup, realtime collaboration, or broad collaboration UX.
- Dashboard-only checks that require the user must be given one step at a time, including why the step is needed and what value or screen proves completion.

## Current Completed Baseline

These items are done and should not be reworked:

| Area | Status |
| --- | --- |
| Google OAuth cloud login | complete in preview |
| Safe same-site post-login redirect handling | complete in preview |
| Dedicated no-access auth screen | complete in preview |
| Project-scoped membership and manager guard baseline | complete in preview |
| Request-integrity checks for invalid and missing origin probes | complete in preview |
| `/api/system/status` authentication and no-store behavior | complete in preview |
| Runtime security header baseline | complete in preview |
| GitHub workflow baseline | added in repo |
| Dependabot baseline | added in repo |
| GitHub `main` branch ruleset | configured externally |
| Vercel Preview Authentication | restored externally |
| Preview Supabase data shape | created and verified |
| Preview Vercel Supabase env bundle | narrowed to Preview where present |
| PR required checks | clean after CodeQL alert remediation |
| Preview RLS and Storage policy rollout | applied and probed in Preview |
| Preview file upload/download flow | verified through the local app server against Preview DB/Storage |
| Latest PR required checks | `dabb052` passed GitHub checks and Vercel status |
| Final app-visible preview runtime header smoke | `3199f00` / `dpl_6EzQmCbdjRdMw1J3ghGBzFNbU4UY` `/login` returned `200` with the expected header baseline |
| Production promotion | deferred by user; no production root URL yet |
| Vercel Production env readiness | not ready for production deploy; `APP_BACKEND_MODE=cloud` exists, Supabase/Postgres production variables are not configured |

## Current Known Risks

| Risk | Why it matters | Next action |
| --- | --- | --- |
| Remote protected preview file-flow session is not automated | the upload intent, direct Storage upload, commit, signed download, failed-commit cleanup, and final data cleanup passed through the local app server against Preview DB/Storage; Vercel Preview Authentication still blocks custom-cookie API automation on the remote URL | optional only; perform a manual protected-preview browser session if exact deployed-browser UI sign-off is later required |
| production dashboard checks remain | production URL, Vercel Production env vars, Supabase Auth URLs, and Google OAuth redirect URI require dashboard access or exact user-provided values | complete [2026-04-24-release-readiness-signoff.md](2026-04-24-release-readiness-signoff.md) before production promotion |
| production runtime smoke is not verified | production has not been promoted and exact production URL is not confirmed | verify `/login`, `/api/system/status`, OAuth callback, and runtime headers after production deploy |

## Non-Production Completion Snapshot

These items are complete and can be treated as the handoff baseline for later work:

- Preview Google OAuth, no-access, and project-scoped RBAC flows are verified.
- Cookie-authenticated mutation integrity is implemented and verified for invalid and missing origin probes.
- Project/task/file/admin app guards are implemented.
- `/api/system/status` is authenticated and no-store.
- CI, CodeQL, Semgrep, dependency audit, Dependabot, and required-check remediation are complete.
- Preview Supabase/Postgres data gate is complete.
- Preview RLS and Storage policies are designed, applied, and probed.
- Assignee `assigneeProfileId` foundation is implemented and preview migration/backfill checks passed.
- Concurrency hardening for task numbers, reorder conflicts, and file version uniqueness is implemented.
- Conflict UX recovery for task update, reorder, and file-version conflicts is implemented.
- Project B direct file flow was verified against Preview DB/Storage with final cleanup.
- Latest PR checks and Vercel status passed on `dabb052`; app-visible preview header smoke passed on `3199f00`, which was the latest deployment that Vercel MCP could access through Preview Authentication for the app-visible runtime check.

Do not restart these slices unless a regression appears.

## Work Order

### 1. Commit Current Documentation Cleanup

Status:

- complete

Owner:

- Codex

Work:

- stage and commit the 2026-04-23 and 2026-04-24 documentation cleanup
- keep unrelated untracked files out of the commit:
  - `awesome-design-md/`
  - `preview-baseline.sql`

Exit:

- docs accurately describe the completed preview work and active next plan

### 2. Resolve PR Required Check Failures

Status:

- complete after typecheck, Semgrep, and CodeQL remediation; latest required checks passed after subsequent documentation updates

Owner:

- Codex

Work:

- inspect GitHub PR check logs
- fix `typecheck`
- triage CodeQL alerts:
  - fix real issues
  - document or suppress only if proven false positive
- triage Semgrep failures:
  - fix real issues
  - adjust workflow/config only if the rule or scan setup is invalid for this repo
- rerun local verification:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run deps:audit`

Exit:

- required checks pass or each remaining failure has a documented blocker and owner

### 3. Minimal Remaining Preview Verification

Status:

- complete for non-production readiness
- Project B manager access, request-integrity probes, DB/Storage policy probes, and local-app Preview file flow have passed
- exact remote deployed-browser session verification remains optional manual sign-off because Vercel Preview Authentication prevents automated custom-cookie app API calls

Owner:

- Codex for instructions and interpretation
- user only if browser or dashboard access is required

Work:

- verify `Project B` selection and `/api/project` result if needed for sign-off
- skip destructive `PATCH /api/project` manager-negative probe unless sign-off explicitly requires it
- keep no-access direct API probes deferred unless there is a reliable way to separate app login from Vercel Authentication session reuse

Exit:

- preview verification is sufficient to move into the policy boundary slice without reopening login/RBAC basics

### 4. RLS And Storage Policy Boundary

Status:

- complete for Preview
- preview DB/Storage policy rollout applied on 2026-04-24
- DB-level RLS, manager, no-access, anonymous, and rollback-only Storage insert probes passed
- Project B upload intent, direct Storage upload, commit, signed download, failed-commit cleanup, and final DB/Storage cleanup verified through `http://localhost:3000` against Preview DB/Storage on 2026-04-24

Owner:

- Codex first
- user only if browser/session access or persistent fixture creation is required

Work:

- inventory browser-facing or future browser-facing tables:
  - `profiles`
  - `projects`
  - `project_memberships`
  - `tasks`
  - `files`
  - `profile_preferences`
  - `work_type_definitions`
- inventory storage access paths and object key conventions
- design RLS policy helpers around project membership and global admin bypass
- design Supabase Storage policies for read, upload, update, and delete
- use the draft in [2026-04-24-rls-storage-policy-boundary-design.md](2026-04-24-rls-storage-policy-boundary-design.md)
- apply policies to preview first
- ensure the private `task-files` preview bucket exists
- run negative and positive probes:
  - anonymous
  - unrelated authenticated user
  - project member
  - project manager
  - global admin

Exit:

- unrelated authenticated access is denied at the database or storage layer
- normal member and manager flows still work in preview
- exact remote deployed-browser session sign-off is tracked separately only if required

### 5. Assignee Profile Link Foundation

Status:

- complete for the current slice
- implemented locally and applied to preview DB on 2026-04-24
- unresolved assignee mapping report returned `0`

Owner:

- Codex

Work:

- add `assigneeProfileId` while preserving legacy assignee display text
- constrain assignee options to current project members
- add server-side validation for project-member assignee ids
- define safe backfill behavior:
  - exact email match
  - exact display-name match
  - normalized display-name match
  - ambiguous or missing matches stay `null`
- use unresolved mapping report [sql/2026-04-24-assignee-profile-backfill-unresolved.sql](sql/2026-04-24-assignee-profile-backfill-unresolved.sql) after migration rollout

Exit:

- assignment can reference a real project member without breaking legacy data

### 6. Concurrency Hardening

Status:

- complete for the current slice
- implemented locally and applied to preview DB on 2026-04-24
- conflict UX recovery has been implemented for the new recoverable paths

Owner:

- Codex

Work:

- make task number issuance transaction-safe
- detect reorder conflicts instead of silently overwriting sibling order
- prevent duplicate file next-version creation
- return clear `409` responses for recoverable write conflicts
- includes migration `202604240003_add_file_version_uniqueness`

Exit:

- the main concurrent write paths fail safely instead of corrupting ordering, numbering, or file versions

### 7. Conflict UX And Release Readiness

Status:

- non-production release readiness is complete
- 409 recovery behavior implemented for task update, task reorder, and file-version upload conflicts
- latest required checks and Vercel status passed on `dabb052`
- final app-visible preview runtime header smoke passed on `3199f00` / `dpl_6EzQmCbdjRdMw1J3ghGBzFNbU4UY`
- production promotion is deferred because the production root URL is not set
- Vercel Production env is not ready for production deploy: user confirmed `APP_BACKEND_MODE=cloud` exists, but Production Project/Shared env vars do not include the required Supabase/Postgres values
- production Supabase Auth URLs, Google OAuth callback, and production runtime smoke still require external sign-off when production resumes

Owner:

- Codex first
- user for final preview and production-adjacent checks

Work:

- add user-facing recovery behavior for new `409` paths
- confirm production environment variables are production-specific before production deployment
- confirm production Supabase URL configuration
- confirm Google OAuth authorized redirect URIs for production
- confirm runtime headers on the final preview deployment
- confirm required checks block merge when failing and pass when fixed
- keep DB migration, seed, bootstrap, and backup as manual operational steps

Exit:

- PR checks and final preview smoke are clean
- production deploy path remains blocked until a production root URL and production-only env values are configured
- any required cloud DB action has an explicit backup and manual execution plan

## User Gates Remaining

The user should only be asked for these external actions:

- provide or verify production URL and OAuth callback values
- verify Vercel Production env vars point only to the production Supabase project
- perform browser-only preview or production checks when account/session access is required
- approve any production DB migration, seed, bootstrap, or backup action

## Out Of Scope Until After This Plan

- new role model such as `viewer` or `editor`
- open self-signup
- full realtime collaboration
- broad UI redesign
- production data migration beyond the explicit release checklist
