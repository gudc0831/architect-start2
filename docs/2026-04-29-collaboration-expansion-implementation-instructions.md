# Collaboration Expansion Implementation Instructions

- Updated: 2026-04-29
- Status: execution instructions; Steps 0-6 completed on 2026-04-29
- Source plan: [2026-04-28-collaboration-expansion-plan.md](2026-04-28-collaboration-expansion-plan.md)
- Phase 1 baseline: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- Auth/RBAC baseline: [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
- Deployment baseline: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)

## How To Use This File

Follow the steps in order.

Current progress:

- Step 0 decisions are approved and recorded.
- Step 2 capability helpers are implemented.
- Step 3 staged role migration files were added and applied to Preview DB after backup and user approval.
- Step 4 app-level guards and expanded policy SQL were applied to Preview after backup and user approval.
- Steps 5-6 invitation bootstrap and pending access foundation are implemented and applied to Preview after backup and user approval.
- Step 7 collaboration management UX is in progress: current project role is exposed to the client, viewer/non-editor workspace mutation controls are hidden or read-only, `/admin` is open to active project users with role-gated controls, and invitation/access-request UI foundations are implemented.
- Production DB migration remains not started.

Rules:

- Do not skip a `STOP` item.
- Do not run Preview or Production DB migrations without explicit user approval.
- Do not touch unrelated untracked files:
  - `awesome-design-md/`
  - `preview-baseline.sql`
- Keep Production deployment out of scope unless the user explicitly resumes production work.
- After every non-trivial slice, add or update one worklog under `docs/worklogs/`.
- Run the verification commands listed for the slice before moving on.

## Step 0. Required User Decisions

Completed on 2026-04-29.

Approved:

1. Existing project `member` rows migrate to project `editor`.
2. Unaffiliated Google users may create a pending profile.
3. Pending users can submit a general access request, and can request a specific project only through an invitation or access link.

Already resolved:

- `viewer` can see project member names and email addresses.
- project `manager` can invite and approve `viewer` and `editor`.
- project `manager` cannot approve, assign, grant, or revoke `manager`.
- only global `admin` can approve, assign, grant, or revoke `manager`.
- realtime starts with refresh/invalidation, then presence and active-editor signals, then field/cell edit leases.
- task selection or task viewing must never create an edit lock.
- automatic merge is deferred.

Exit:

- [2026-04-28-collaboration-expansion-plan.md](2026-04-28-collaboration-expansion-plan.md) records the approved direction
- [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md) must be updated before code implementation continues

## Step 1. Preflight

Commands:

```powershell
git status --short --branch
npm run typecheck
npm run lint
npm run build
npm run deps:audit
npx prisma validate
```

Expected:

- branch is `codex/multi-user-transition`
- only expected untracked files remain:
  - `awesome-design-md/`
  - `preview-baseline.sql`
- all commands exit `0`

If any verification fails:

- stop
- inspect the failure
- fix only if it is related to this work
- do not hide or downgrade checks

## Step 2. Lock The Expanded RBAC Contract

Files:

- `docs/2026-04-10-auth-rbac-contract.md`
- `docs/2026-04-28-collaboration-expansion-plan.md`
- `src/domains/admin/types.ts`
- `src/domains/auth/types.ts`
- new helper file if useful, for example `src/lib/auth/project-capabilities.ts`

Work:

1. Add the post-Phase 1 project role model to the RBAC contract.
2. Keep global roles as:
   - `admin`
   - `member`
3. Use project roles as approved in Step 0.
4. Add a single capability helper layer.
5. Use helpers instead of scattered role string checks.

Minimum helper contract:

```ts
type GlobalRole = "admin" | "member";
type ProjectRole = "viewer" | "editor" | "manager" | "member";

function canReadProject(input: { globalRole: GlobalRole; projectRole: ProjectRole | null }): boolean;
function canEditProjectWorkspace(input: { globalRole: GlobalRole; projectRole: ProjectRole | null }): boolean;
function canManageProjectMembers(input: { globalRole: GlobalRole; projectRole: ProjectRole | null }): boolean;
function canGrantProjectManager(input: { globalRole: GlobalRole; projectRole: ProjectRole | null }): boolean;
function canApproveAccessRequest(input: {
  globalRole: GlobalRole;
  projectRole: ProjectRole | null;
  requestedRole: "viewer" | "editor" | "manager";
}): boolean;
```

Rules:

- global `admin` bypasses project membership for normal project access
- `viewer` can read task/file/project data
- `viewer` can see project member names and email addresses
- `viewer` cannot create, update, reorder, delete, upload, or approve
- `editor` can read and write normal task/file workspace data
- `editor` cannot manage membership, invitations, access requests, or project settings
- `manager` can manage project settings and members
- `manager` can invite/approve only `viewer` and `editor`
- only global `admin` can approve, assign, grant, or revoke `manager`

Verification:

```powershell
npm run typecheck
```

Exit:

- capability helpers compile
- docs and helper logic match the permission matrix

## Step 3. Plan The Staged Role Migration

Files:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- `sql/*` if the repo uses manual policy or probe SQL for this slice
- `src/repositories/admin/local-store.ts`
- `src/repositories/admin/postgres-store.ts`
- `src/domains/admin/types.ts`
- `src/components/admin/admin-foundation-shell.tsx`

Important:

- Do not do a one-step enum replacement.
- PostgreSQL enum changes and Prisma defaults must be staged.

Required migration sequence:

1. Add new project role enum values.
   - Add `viewer`.
   - Add `editor`.
   - Keep existing `member` for compatibility during the transition.
2. Change the Prisma/default project membership role from old `member` to the approved default.
   - If Step 0 approves the recommendation, default should become `editor`.
3. Backfill existing project memberships.
   - If Step 0 approves the recommendation, update existing `member` rows to `editor`.
4. Update code and policies to treat legacy `member` as editor-equivalent during the compatibility window.
5. Add a report query that counts remaining legacy `member` rows.
6. Only remove the legacy `member` enum value in a later, separate migration after:
   - report returns `0`
   - code no longer writes `member`
   - policies no longer reference `member`
   - user approves the cleanup migration

Verification:

```powershell
npx prisma validate
npm run db:generate
npm run typecheck
```

STOP before applying to Preview DB:

- run `npm run data:backup`
- ask the user to approve Preview DB migration
- do not apply to Production

Exit:

- schema and code support expanded roles
- no existing membership is accidentally dropped
- legacy role cleanup is explicitly deferred

## Step 4. Update Guards, APIs, RLS, And Storage Policies

Files:

- `src/lib/auth/project-guards.ts`
- capability helper file from Step 2
- `src/app/api/projects/**`
- `src/app/api/project/**`
- `src/app/api/tasks/**`
- `src/app/api/files/**`
- `src/app/api/admin/**`
- RLS policy SQL files
- Storage policy SQL files

Work:

1. Keep read guard behavior for:
   - global `admin`
   - project `viewer`
   - project `editor`
   - project `manager`
2. Add an editor-capability guard for task/file workspace writes.
3. Keep manager-only guard for:
   - project rename
   - project work types/categories
   - project member management
   - invitations
   - access request review
4. Enforce admin-only guard for:
   - global foundation settings
   - project create/delete if still global-only
   - assigning or approving `manager`
5. Update RLS:
   - read policies allow `viewer`, `editor`, `manager`
   - workspace write policies allow `editor`, `manager`
   - manager policies allow `manager`
   - global admin bypass remains explicit
6. Update Storage policies:
   - read/download allow `viewer`, `editor`, `manager`
   - upload/update/delete allow `editor`, `manager`

Probes to add or run:

- viewer read allowed
- viewer task write denied
- viewer file upload denied
- viewer can list project member names/emails
- editor write allowed
- editor membership management denied
- manager viewer/editor approval allowed
- manager manager-approval denied
- global admin manager-approval allowed
- non-member denied

Verification:

```powershell
npm run typecheck
npm run lint
npm run build
npm run deps:audit
```

STOP before applying policy changes to Preview:

- run `npm run data:backup`
- ask the user to approve Preview policy rollout

Exit:

- API behavior and database/storage policy behavior match the matrix

## Step 5. Invitation Bootstrap

Files:

- `prisma/schema.prisma`
- `src/app/api/invitations/**` or equivalent route group
- `src/app/invitations/**` or equivalent page group
- `src/lib/auth/require-user.ts`
- `src/lib/supabase/server.ts`
- `src/repositories/admin/contracts.ts`
- `src/repositories/admin/postgres-store.ts`
- `src/repositories/admin/local-store.ts`

Problem this step must solve:

- invited users may have a valid Supabase Google session but no app `profiles` row yet
- normal `requireUser()` currently returns no app user when the profile row is missing
- invitation acceptance must have a bootstrap path that runs before normal app guards

Data model:

- `project_invitations`
  - `id`
  - `projectId`
  - `email`
  - `role`
  - `status`
  - `tokenHash`
  - `expiresAt`
  - `createdBy`
  - `acceptedByProfileId`
  - `acceptedAt`
  - `createdAt`
  - `updatedAt`

Token rules:

- generate a high-entropy raw token
- store only a hash
- show/copy the raw token only once
- raw token is allowed in Preview copy-link workflow
- email sending is deferred until token acceptance works

Accept flow:

1. User opens invitation link.
2. If no Supabase session exists, send user through Google OAuth and return to the invite accept route.
3. Validate the Supabase authenticated email.
4. Validate token hash.
5. Validate invitation status is `pending`.
6. Validate invitation is not expired.
7. Validate invitation email equals Supabase email unless a future admin override is explicitly approved.
8. If profile does not exist:
   - create profile using Supabase user id
   - set global role to `member`
   - set profile status according to the approved Step 0 signup mode
9. Create or update project membership with the invitation role.
10. Mark invitation as `accepted`.
11. Redirect through the existing post-login landing flow.

Manager/admin rules:

- manager can create invitations only for projects they manage
- manager can invite only `viewer` or `editor`
- admin can invite `viewer`, `editor`, or `manager`
- expired or revoked invitations must fail without creating membership

Verification:

- invite viewer by manager
- invite editor by manager
- manager invite manager denied
- admin invite manager allowed
- invited user without existing profile accepts invite
- wrong Google email cannot accept invite
- revoked invite cannot be accepted
- expired invite cannot be accepted

Exit:

- invitation acceptance works for users with and without existing app profiles

## Step 6. Pending Profile And Access Requests

Files:

- `prisma/schema.prisma`
- `src/app/auth/no-access/**`
- `src/app/auth/pending-access/**` if created
- access request route group
- admin/project management route group
- admin/project management UI

Implement according to Step 0 decision.

If self-signup is approved:

1. Add profile access state:
   - `active`
   - `pending`
   - `disabled`
2. On first Google login with no profile:
   - create pending profile
   - do not create membership
   - redirect to pending-access page
3. Pending profile can access only:
   - pending/no-access page
   - invitation accept route
   - access request route
   - logout
4. Pending profile cannot list projects or use workspace APIs.

If invite-only remains:

1. Keep no-profile users out of the app.
2. Allow invitation accept bootstrap to create a profile only through a valid invitation.
3. Keep no-access messaging clear.

Access request model:

- `access_requests`
  - `id`
  - `profileId`
  - `email`
  - `projectId` nullable
  - `message`
  - `status`
  - `requestedRole`
  - `reviewedBy`
  - `reviewedAt`
  - `createdAt`
  - `updatedAt`

Rules:

- pending users cannot list projects
- if project-specific requests are approved in Step 0, require invitation/access link context
- if only general requests are approved, keep `projectId` nullable and route review to global admin
- manager can approve only `viewer` or `editor`
- admin can approve `viewer`, `editor`, or `manager`
- rejection keeps audit history

Verification:

- pending user cannot access normal board
- pending user can submit allowed request type
- manager approves viewer/editor request
- manager cannot approve manager request
- admin can approve manager request
- rejected request does not create membership

Exit:

- unaffiliated sign-in has a stable outcome
- access approval creates only authorized memberships

## Step 7. Collaboration Management UX

Files:

- `src/components/admin/admin-foundation-shell.tsx`
- project member management components
- `src/components/tasks/task-workspace.tsx`
- `src/lib/ui-copy/catalog.ts`

Work:

1. Update role labels:
   - viewer
   - editor
   - manager
   - admin
2. Update project member list:
   - show names
   - show emails
   - visible to viewer/editor/manager/admin
3. Update management controls:
   - viewer: no mutation controls
   - editor: no member/request/invite controls
   - manager: can invite/approve viewer/editor and edit viewer/editor membership
   - admin: can manage manager role
4. Add invitation UI:
   - pending invitations
   - create invite
   - revoke invite
   - copy invite link
5. Add access request UI:
   - pending requests
   - approve as viewer/editor for manager
   - approve as viewer/editor/manager for admin
   - reject
6. Add viewer read-only board UX:
   - hide create/edit/reorder/upload controls
   - show read-only indicator
   - stale mutation attempts show clear denial copy

Verification:

- viewer can see member names/emails
- viewer cannot edit task
- viewer cannot upload file
- editor can edit task
- editor cannot invite or approve
- manager can invite viewer/editor
- manager cannot grant manager
- admin can grant manager

Exit:

- users can understand their role without discovering it through failed API calls

## Step 8. Realtime Refresh And Invalidation

Files:

- `src/providers/dashboard-provider.tsx`
- `src/providers/project-provider.tsx`
- new realtime helper files
- mutation use cases for tasks/files/project settings/members/invitations/access requests

Transport:

- Prefer Supabase Realtime project-scoped channel if it fits the existing Supabase setup.
- If not, use short polling as a temporary fallback and document why.

Event shape:

```ts
type ProjectRealtimeEvent = {
  projectId: string;
  type:
    | "task.changed"
    | "file.changed"
    | "project.changed"
    | "membership.changed"
    | "invitation.changed"
    | "accessRequest.changed";
  targetId?: string;
  actorProfileId: string;
  occurredAt: string;
};
```

Rules:

- subscribe only to current project
- publish after successful mutation commit
- do not publish for failed writes
- do not merge edits automatically
- show "changes available" or refresh affected data
- keep existing conflict UX

Verification:

- session A updates a task
- session B sees refresh prompt or updated data
- session A uploads file
- session B sees file refresh
- non-member cannot subscribe to project data

Exit:

- project changes propagate across sessions without changing write semantics

## Step 9. Presence And Active Editor Signals

Files:

- realtime helper files
- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/task-inline-editor-overlay.tsx`

Presence behavior:

- show who is currently viewing the project
- optional task-level viewing is allowed
- task viewing never blocks editing
- presence expires by heartbeat/TTL

Active editor behavior:

- starts only when user enters edit mode
- target key includes:
  - `projectId`
  - target type
  - target id
  - field/cell key
- signal includes:
  - profile id
  - display name
  - heartbeat timestamp
- ends on save, cancel, blur, route change, or heartbeat expiry
- active editor signal alone does not enforce writes

Verification:

- session A views project; session B sees presence
- session A selects task; session B is not blocked
- session A edits title field; session B sees active editor hint
- signal expires after heartbeat stops

Exit:

- collaboration context is visible but not authoritative for write correctness

## Step 10. Edit Lease

Files:

- `prisma/schema.prisma` if using Postgres lease persistence
- realtime helper files if using Supabase presence for live signal
- edit APIs or route handlers
- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/task-inline-editor-overlay.tsx`

Recommended storage model:

- Use Postgres as the authoritative lease store.
- Use realtime/presence only to display current editing state quickly.

Suggested table:

- `edit_leases`
  - `id`
  - `projectId`
  - `targetType`
  - `targetId`
  - `fieldKey`
  - `holderProfileId`
  - `holderDisplayName`
  - `expiresAt`
  - `createdAt`
  - `updatedAt`

Constraints:

- unique active lease target:
  - `projectId`
  - `targetType`
  - `targetId`
  - `fieldKey`
- index `expiresAt`
- index `holderProfileId`

Acquire semantics:

1. User enters edit mode.
2. Client requests lease for field/cell target.
3. Server deletes or ignores expired lease for the same target.
4. If no active lease exists, create lease.
5. If active lease belongs to same user/session, renew lease.
6. If active lease belongs to another user, deny lease.
7. Client keeps field read-only and shows who is editing.

Renew/release:

- renew while editor is active
- release on save
- release on cancel
- release on route change where possible
- release on tab close where possible
- expire automatically when heartbeat stops

Rules:

- task selection alone never creates a lease
- task viewing alone never creates a lease
- field/cell lease is preferred
- task-level lease is allowed only where stable field keys are impossible
- denied lease must preserve local draft if the user already typed locally

Verification:

- session A edits title and receives lease
- session B cannot edit same title while lease is active
- session B can edit a different field if field-level lease is used
- session A save releases lease
- stale lease expires without manual cleanup
- task selection without edit mode does not create a lease

Exit:

- active editing conflict is prevented without blocking normal viewing

## Step 11. Preview Verification

Before Preview rollout:

```powershell
npm run typecheck
npm run lint
npm run build
npm run deps:audit
npx prisma validate
```

Before any Preview DB change:

```powershell
npm run data:backup
```

STOP:

- ask the user for explicit approval before applying Preview migrations or policy SQL

Preview accounts needed:

- admin
- manager
- editor
- viewer
- pending or no-access user
- invited user before acceptance
- invited user after acceptance
- rejected request user

Preview test matrix:

- viewer can read board
- viewer can download signed file
- viewer can see member names/emails
- viewer cannot create/update/reorder/delete task
- viewer cannot upload file
- editor can create/update/reorder task
- editor can upload file
- editor cannot invite or approve access request
- manager can invite viewer/editor
- manager cannot invite or approve manager
- manager can approve viewer/editor request
- admin can approve manager request
- pending user cannot list projects
- invitation acceptance works for a user without existing profile
- wrong Google email cannot accept invitation
- revoked/expired invitation fails
- refresh/invalidation works across two sessions
- presence works across two sessions
- active editor signal works across two sessions
- edit lease blocks same field/cell editing
- stale edit lease expires

Exit:

- all checks pass
- any failed item has a documented blocker and owner

## Step 12. Commit And Push

Commands:

```powershell
git status --short --branch
git diff --check
npm run worklog:check
git add -- <changed files>
git commit -m "<clear commit message>"
git push origin codex/multi-user-transition
```

After push:

- confirm GitHub checks:
  - `typecheck`
  - `lint`
  - `build`
  - `deps-audit`
  - `semgrep`
  - `CodeQL`
- confirm Vercel status is success

Exit:

- branch is pushed
- checks are green
- only unrelated untracked files remain if still present:
  - `awesome-design-md/`
  - `preview-baseline.sql`

## Stop Conditions

Stop and ask the user before:

- choosing any unresolved Step 0 product decision
- running cloud DB backup/migration/policy rollout
- applying anything to Production
- adding email delivery provider
- exposing a public project directory to pending users
- changing the production branch/deployment model
- removing legacy project `member` enum value

## Final Report Template

Use this shape in the final report:

```text
Done:
- ...

Changed files:
- ...

Verification:
- ...

Still blocked or needs user:
- ...
```
