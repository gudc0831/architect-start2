# Auth And RBAC Contract

- Updated: 2026-04-10
- Parent index: [../PLAN.md](../PLAN.md)
- Execution plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- Post-Phase 1 expansion plan: [2026-04-28-collaboration-expansion-plan.md](2026-04-28-collaboration-expansion-plan.md)
- Deployment guardrails: [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)

## Purpose

This document locks the chosen auth and RBAC decisions for the phase 1 multi-user rollout.

Use this file as the implementation contract for:

- security boundary direction
- login method
- provisioning rule
- role model
- server guard hierarchy
- redirect safety and request integrity
- SSR callback and cache rules
- post-login UX outcomes
- migration sequencing

Do not reopen these choices inside implementation tickets unless the product decision has changed.

## Locked Decisions

### 1. Security Boundary Direction

Long-term cloud security is not enforced only by application route guards.

Target boundary:

- application guard chain
- Postgres RLS for browser-reachable data paths
- Storage policies on `storage.objects` for browser-reachable file paths

Rules:

- direct browser access must be constrained by RLS or storage policy before it is considered production-safe
- `SUPABASE_SERVICE_ROLE_KEY` is reserved for bootstrap, provisioning, maintenance, background jobs, and other explicitly trusted server-only operations
- service-role access is not the default execution path for user-scoped task, file, project, or preference reads and writes
- Prisma- or route-level filtering may remain part of the application layer, but it is not the only long-term protection layer

Implementation note:

- if the app ships a direct browser upload, download, or data-read path, matching policy protection must ship with it

### 2. Login Method

Phase 1 cloud login is `Supabase Google OAuth`.

Rules:

- cloud mode uses Google OAuth as the user-facing login path
- the OAuth flow follows the SSR or cookie-based PKCE path, not a client-only implicit shortcut
- login starts with `signInWithOAuth(...redirectTo)`
- the redirect target must be a dedicated callback route that exchanges the code for a session
- redirect URLs must be allow-listed for:
  - localhost development
  - preview deployments
  - the exact production site URL
- the current password login route is not the long-term cloud entry point
- password login may remain temporarily for local development, bootstrap, or controlled test utility
- production cutover happens only after preview verification is complete

Implication for the current code:

- `src/app/api/auth/login/route.ts` is transitional
- `src/app/auth/callback/route.ts` should become the main OAuth callback entry
- `src/app/login/page.tsx` and the login UI must eventually present Google login in cloud mode

### 3. Provisioning Rule

Successful Google authentication does not automatically grant app access.

Phase 1 access is pre-provisioned.

Rules:

- allowed access requires an existing application profile
- non-admin access also requires at least one valid project membership
- provisioning is done ahead of time by bootstrap, admin action, or setup script
- phase 1 does not allow open self-signup

Result:

- `auth success` and `app access granted` are separate states

### 4. RBAC Merge Rule

The role model is split between global role and project role.

Global role:

- `Profile.role`
- phase 1 meaning:
  - `admin`: global bypass and platform-level authority
  - `member`: regular non-admin user

Project role:

- `ProjectMembership.role`
- phase 1 meaning:
  - `manager`: project-level administrative authority
  - `member`: standard project contributor

Phase 1 merge logic:

- if `Profile.role === admin`, the user has global bypass
- otherwise, the user must have membership in the selected or requested project
- project-scoped capability comes from `ProjectMembership.role`

Out of scope for phase 1:

- `viewer`
- `editor`
- organization-level nested role matrices

### 5. Server Guard Hierarchy

The server guard chain is locked to this model:

1. `requireUser()`
2. `requireProjectAccess(projectId or resolved project)`
3. `requireProjectManager(projectId or resolved project)`
4. `requireAdmin()`

Expected behavior:

- `requireUser()`
  - proves authenticated user identity
  - resolves the current app user profile
- `requireProjectAccess()`
  - proves the user can access the project
  - allows global admin bypass
  - returns project and membership context for downstream use
- `requireProjectManager()`
  - proves the user can manage project-scoped settings and membership
  - allows global admin bypass
- `requireAdmin()`
  - proves global platform-level administrative access

Guard mapping by area:

- `/api/projects` and `/api/projects/select`
  - `requireUser()`
  - membership-filtered results for non-admin users
- task and file reads/writes inside a project
  - `requireProjectAccess()`
- project rename, membership changes, project-scoped definitions
  - `requireProjectManager()`
- global admin routes and platform-wide settings
  - `requireAdmin()`

Selection and cookie rule:

- the current-project cookie is a UX hint only
- server code must re-resolve the selected project against current membership or global admin status
- a user-supplied `projectId` in request body, query, or cookie is never sufficient by itself to authorize access or mutation

### 6. Redirect Safety And Request Integrity

Redirect safety:

- `next`, `returnTo`, and similar post-login redirect targets must be same-site relative paths
- reject absolute external URLs, protocol-relative URLs, and non-http navigation schemes
- when redirect input is invalid, fall back to a safe internal default such as `/board` or a post-login landing route

Cookie-authenticated mutation rule:

- POST, PUT, PATCH, and DELETE routes that rely on session cookies must enforce explicit request-integrity checks
- accepted protections are:
  - strict `Origin` and `Referer` validation against the configured app origins
  - or a documented CSRF token contract
- Next.js middleware auth alone is not sufficient proof for state-changing request integrity

Diagnostics rule:

- public production diagnostics must not expose backend mode, provider mode, or environment-presence details unless explicitly approved

### 7. SSR Callback And Cache Rules

The Google login path must respect the current Supabase SSR guidance.

Rules:

- middleware or proxy refreshes auth cookies for server-rendered requests
- server-side protection code must use a revalidated auth check, not a stale session snapshot
- the OAuth callback route exchanges the auth code for the session before redirecting deeper into the app
- after OAuth callback, route users through one stable post-login landing path before sending them to heavily prefetched workspace routes
- auth-sensitive pages and APIs must not rely on public caching
- protected client fetches use relative URLs so the current domain and auth cookies remain attached

Operational implication:

- avoid sending users directly from the provider callback into a route where Next.js prefetching can race ahead of cookie establishment

### 8. Post-Login UX Outcomes

After a successful Google auth response, the app must resolve into one of these states.

#### State A. Access Granted

Conditions:

- user has a valid profile
- user is global admin or has at least one accessible project

Outcome:

- redirect to last valid project or first valid project
- land on the normal board flow

#### State B. No Project Access

Conditions:

- user is authenticated
- user is not global admin
- user has no accessible project memberships

Outcome:

- do not send the user into `/board`
- show a dedicated `no access` or `access pending` screen
- explain that sign-in succeeded but project access is not provisioned

#### State C. Admin With No Projects

Conditions:

- user is global admin
- no project exists yet

Outcome:

- send the user to a setup or admin-first state, not a broken empty board

Phase 1 does not introduce a separate approval workflow object unless implementation later requires it.
The minimum acceptable UX is a stable no-access page with clear messaging.

### 9. Migration Path

The migration from the current password-oriented cloud flow to the locked Google OAuth plus RBAC model is sequential, not big-bang.

Required order:

1. Schema and helper cleanup
2. Google OAuth callback path
3. safe post-login redirect handling
4. auth user to profile resolution under the new contract
5. membership-filtered project selection and project guards
6. mutation request-integrity protection
7. Postgres RLS and Storage policy rollout for browser-facing paths
8. preview validation with real cloud accounts
9. cloud password-flow retirement from the user-facing login path

## Runtime Identity Contract

Identity keys:

- source of truth for login identity: Supabase auth user id
- application profile id must match the provider user id in cloud mode

User fields used by the app:

- `id`
- `email`
- `displayName`
- `role`

Project access record:

- `projectId`
- `profileId`
- `role`

Email and display name are descriptive data.
Authorization is based on stable user id and membership records, not on display text.

## Policy Boundary Expectations

Postgres:

- RLS applies to any table the browser may reach directly now or later
- membership checks should be policy-backed and index-aware
- unrelated authenticated users must be denied even if an application-layer bug leaks a query path

Storage:

- private buckets remain private
- object paths must encode enough project context for policy checks
- upload, select, update, and delete permissions are granted only through explicit `storage.objects` policies

Service role:

- never exposed to browser bundles
- never used as the default path for user-scoped workspace access
- allowed only in trusted server contexts that are explicitly documented

## Current Code Gaps This Contract Closes

Current code still shows these gaps:

- password login remains the cloud login path in `src/app/api/auth/login/route.ts`
- project list and selection are not yet fully membership-scoped in `src/use-cases/admin/admin-service.ts`
- the guard chain stops too early at `requireUser()` in many APIs
- project rename and similar mutations are still reachable from routes that only prove `requireUser()`
- login `next` redirect handling is not yet locked to same-site relative paths
- cookie-authenticated mutation routes do not yet document or enforce a request-integrity rule
- project membership exists in schema but is not yet the main access boundary
- the long-term RLS and storage policy boundary is not yet documented or implemented
- the SSR OAuth callback and post-login cache rules are not yet locked in writing

This contract is the target state that implementation must drive toward.

## File Map

- Login and auth flow
  - `src/app/api/auth/*`
  - `src/app/auth/*`
  - `src/app/login/page.tsx`
  - `src/components/auth/login-form.tsx`
  - `src/lib/auth/*`
  - `src/lib/supabase/*`
  - `middleware.ts`
- Project access and selection
  - `src/use-cases/admin/admin-service.ts`
  - `src/use-cases/task-project-context.ts`
  - `src/use-cases/project-scope-guard.ts`
  - `src/lib/project-session.ts`
  - `src/app/api/projects/*`
  - `src/app/api/project/route.ts`
- Project-scoped RBAC
  - `src/app/api/admin/**`
  - `src/repositories/admin/*`
  - `prisma/schema.prisma`

## Verification Checklist

Before phase 1 sign-off, verify all of the following in preview cloud mode:

1. Google OAuth login succeeds for allowed accounts.
2. The callback route exchanges the auth code for a session and lands the user on a stable post-login path.
3. Invalid `next` or redirect values fall back to a safe internal location.
4. An authenticated user without project access does not reach normal workspace pages.
5. A non-admin user sees only membership-scoped projects.
6. A non-member cannot read or mutate another project's task or file data through direct API access.
7. A member cannot perform manager-only project mutations.
8. Cookie-authenticated mutation routes reject requests with invalid origin or missing request-integrity proof.
9. An admin can bypass project membership and access all projects.
10. Browser-facing upload and download paths fail safely without matching RLS or storage policy authorization.
11. `SUPABASE_SERVICE_ROLE_KEY` is not required for normal user-scoped workspace traffic.

## Change Control

If the product later chooses any of the following, this document must be revised before implementation starts:

- hybrid Google plus password cloud login
- open self-signup
- `viewer/editor` phase 1 role expansion
- abandoning the RLS and storage-policy boundary for browser-facing paths
- a distinct approval workflow state model

Post-Phase 1 `viewer/editor`, self-signup, invitation/approval, realtime, and collaboration UX decisions are drafted in [2026-04-28-collaboration-expansion-plan.md](2026-04-28-collaboration-expansion-plan.md). Update this contract only after that plan's user decision gates are approved.
