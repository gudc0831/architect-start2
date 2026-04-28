# Collaboration Expansion Plan

- Updated: 2026-04-28
- Status: review draft; implementation must wait for user direction on the decision gates
- Parent index: [../PLAN.md](../PLAN.md)
- Baseline multi-user plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- Locked Phase 1 auth/RBAC contract: [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
- Deployment readiness baseline: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)

## Purpose

This is the post-Phase 1 collaboration expansion plan.

It covers:

- `viewer` and `editor` role expansion
- self-signup and pending access
- invitation and approval workflow
- project-scoped realtime freshness
- broader collaboration UX

It does not reopen the completed Phase 1 baseline. Phase 1 remains:

- Google OAuth in cloud mode
- pre-provisioned access
- global `admin`
- project-scoped `manager/member`
- app guards plus RLS and Storage policies
- Preview-verified non-production readiness

## Direction Summary

Recommended implementation order:

1. Lock the expanded role model and permission matrix.
2. Add schema/domain support for `viewer` and `editor`.
3. Update guards, RLS, Storage policies, and UI capability checks.
4. Add invitation workflow.
5. Add access request and optional self-signup pending profile flow.
6. Add project member/invite/request management UX.
7. Add realtime project refresh/invalidation.
8. Expand to presence and active-editor signals only after refresh semantics are stable.

Reason:

- role semantics affect every later workflow
- invitation and approval need stable target roles
- self-signup should not be opened before pending access and approval states exist
- realtime should refresh correct data before it attempts collaborative editing semantics

## Current Baseline

Existing code and data shape:

- `ProfileRole`: `admin`, `member`
- `ProjectMembershipRole`: `manager`, `member`
- global admin bypass exists through `Profile.role === "admin"`
- normal user access is project membership-based
- project member currently has read/write workspace access
- no current `viewer`, `editor`, invitation, access request, or realtime event model

Current important files:

- `prisma/schema.prisma`
- `src/domains/admin/types.ts`
- `src/domains/auth/types.ts`
- `src/lib/auth/project-guards.ts`
- `src/use-cases/admin/admin-service.ts`
- `src/repositories/admin/contracts.ts`
- `src/repositories/admin/postgres-store.ts`
- `src/repositories/admin/local-store.ts`
- `src/app/api/admin/**`
- `src/app/api/project/**`
- `src/app/api/projects/**`
- `src/app/api/tasks/**`
- `src/app/api/files/**`
- `src/components/admin/admin-foundation-shell.tsx`
- `src/components/tasks/task-workspace.tsx`
- `src/lib/ui-copy/catalog.ts`
- RLS and Storage policy SQL files

## User Decision Gates

These decisions must be approved before implementation starts.

### Gate 1. Project Role Model

Recommendation:

- Use project roles: `viewer`, `editor`, `manager`.
- Keep global roles: `admin`, `member`.
- Migrate existing project `member` rows to project `editor`.
- Treat old project `member` as a temporary compatibility alias only during migration.

Why:

- current project `member` already behaves like an editor
- `viewer/editor/manager` gives a clear permission ladder
- global `member` can remain the normal non-admin profile role

Alternatives:

- Keep project `member` and add `viewer/editor` around it. This preserves the old label but creates four project roles and makes `member` ambiguous.
- Add only `viewer` and keep `member` as the editor-equivalent role. This is simpler but does not satisfy the product language of having a real `editor` role.
- Add organization-level roles now. This is more flexible but too broad for the current project-scoped model.

Question:

- Should existing project `member` users become project `editor` users?

### Gate 2. Self-Signup Mode

Recommendation:

- Do not grant project access from self-signup.
- If self-signup is enabled, Google OAuth may create a `pending` profile.
- A pending profile sees a pending-access page and can request access or accept an invitation.

Why:

- login success and app access stay separate
- open signup does not weaken project isolation
- managers/admins keep control over membership creation

Alternatives:

- Keep invite-only access and do not allow self-signup. This is safest and simplest.
- Allow self-signup to create a pending profile. This is flexible while still blocking project access.
- Allow same-domain self-signup into a default project. This is convenient but risky without a tenant/domain policy.

Question:

- Should unaffiliated Google users be allowed to create a pending profile, or should access remain invite-only?

### Gate 3. Invitation Authority

Recommendation:

- Global `admin` can invite to any project.
- Project `manager` can invite to projects they manage.
- Managers can invite `viewer` and `editor`.
- Only global `admin` can grant or revoke project `manager`, unless the product explicitly wants manager-to-manager delegation.

Why:

- project managers can run day-to-day collaboration
- manager promotion remains a higher-risk action
- admin remains the recovery authority

Alternatives:

- Admin-only invitations. This is simplest but makes collaboration operations bottleneck on global admins.
- Managers can invite and grant all project roles including manager. This is faster but weakens privilege control.
- Managers can invite only viewers; admins handle editors/managers. This is conservative but may be too restrictive.

Question:

- Can project managers invite editors, and can they promote another user to manager?

### Gate 4. Access Request Target

Recommendation:

- Pending users can request workspace access with a message.
- Project-specific access requests require either an invitation link, a project access code, or admin/manager selection from an internal screen.
- Do not expose a public project directory to pending users.

Why:

- non-members should not learn project inventory
- managers need enough context to approve requests
- project-specific requests should be tied to a deliberate share path

Alternatives:

- No request workflow; pending users only see instructions to contact an admin.
- Global access request only; admins assign projects manually.
- Public project request directory. This is convenient but leaks project names.

Question:

- Should pending users request access generally, or request access to a specific project through an invite/access link?

### Gate 5. Realtime Scope

Recommendation:

- Phase 1 of realtime should be project-scoped refresh/invalidation only.
- Do not implement live concurrent editing, multi-cursor editing, or automatic merge yet.
- Add presence and active-editor signals only after refresh/invalidation is stable.

Why:

- existing conflict handling already protects writes
- refresh/invalidation gives visible collaboration value with low merge risk
- presence can be layered without changing write semantics

Alternatives:

- Polling-only refresh. This is simplest but less responsive and less collaborative.
- Supabase Realtime project event channel from the start. This is the recommended middle path.
- Full collaborative editing. This is much larger and should wait until after the simpler signals are stable.

Question:

- Is project-scoped refresh/invalidation an acceptable first realtime milestone?

## Target Permission Matrix

Recommended target if Gate 1 is approved:

| Capability | viewer | editor | manager | admin |
| --- | --- | --- | --- | --- |
| List accessible projects | yes | yes | yes | all projects |
| Select accessible project | yes | yes | yes | any project |
| Read board/task data | yes | yes | yes | yes |
| Export task data | yes | yes | yes | yes |
| Create task | no | yes | yes | yes |
| Update task fields | no | yes | yes | yes |
| Reorder tasks | no | yes | yes | yes |
| Delete or restore task | no | yes | yes | yes |
| Read file metadata | yes | yes | yes | yes |
| Download signed file | yes | yes | yes | yes |
| Upload file | no | yes | yes | yes |
| Create next file version | no | yes | yes | yes |
| Delete file/version | no | yes | yes | yes |
| View project members | yes | yes | yes | yes |
| Invite viewer/editor | no | no | yes | yes |
| Approve access request | no | no | yes | yes |
| Change viewer/editor membership | no | no | yes | yes |
| Grant/revoke manager | no | no | no by default | yes |
| Rename project | no | no | yes | yes |
| Edit project work types/categories | no | no | yes | yes |
| Create/delete project | no | no | no | yes |
| Global foundation settings | no | no | no | yes |

Implementation note:

- UI controls must hide or disable actions that the current role cannot perform.
- API routes and policies remain authoritative even when UI controls are hidden.
- `viewer` is read-only for task/file workspace data, but can still download files unless product direction says otherwise.

## Data Model Plan

### Role Expansion

Schema changes:

- update `ProjectMembershipRole` enum to include `viewer`, `editor`, `manager`
- migrate existing `project_memberships.role = 'member'` to `editor`
- remove or deprecate project-level `member` only after all code paths and policies stop depending on it

Domain changes:

- update `ProjectMembershipRole` in `src/domains/admin/types.ts`
- add shared capability helpers, for example:
  - `canReadProject(role)`
  - `canEditProjectWorkspace(role)`
  - `canManageProjectMembers(role)`
  - `canGrantProjectManager(role, globalRole)`
- avoid scattering string comparisons across routes

Policy changes:

- RLS membership helper must treat `viewer`, `editor`, and `manager` as project access
- RLS write policies must require `editor` or `manager`
- manager-only project settings policies must require `manager` or global admin
- Storage read policies allow `viewer+`
- Storage insert/update/delete policies require `editor+`

### Invitation Workflow

Suggested model:

- `project_invitations`
  - `id`
  - `projectId`
  - `email`
  - `role`
  - `status`: `pending`, `accepted`, `revoked`, `expired`
  - `tokenHash`
  - `expiresAt`
  - `createdBy`
  - `acceptedByProfileId`
  - `acceptedAt`
  - `createdAt`
  - `updatedAt`

Rules:

- store invitation token hash only, not raw token
- invitation role must be within inviter authority
- accepting an invitation creates or updates the matching profile and membership
- invitation email must match the signed-in Google email unless admin override is explicitly approved later
- expired and revoked invitations must not create memberships

### Access Request Workflow

Suggested model:

- `access_requests`
  - `id`
  - `profileId`
  - `email`
  - `projectId` nullable
  - `message` nullable
  - `status`: `pending`, `approved`, `rejected`, `cancelled`
  - `requestedRole`
  - `reviewedBy`
  - `reviewedAt`
  - `createdAt`
  - `updatedAt`

Rules:

- pending users cannot list projects
- project-specific request requires a deliberate share path
- approving a request creates membership for the approved project and role
- rejecting keeps the profile pending but does not delete audit history

### Pending Profile

If self-signup is approved:

- add profile access state, for example `accessStatus`: `active`, `pending`, `disabled`
- first Google login can create a pending profile
- pending profile cannot access normal project routes
- pending profile can access:
  - `/auth/pending-access`
  - invitation acceptance route
  - access request route
  - logout

If self-signup is not approved:

- keep current pre-provisioned profile requirement
- unaffiliated Google users continue to land on no-access
- invitation acceptance can still create/activate a profile if approved by the plan

## Work Orders

### 0. Direction Approval

Owner:

- user for product decisions
- Codex for recording decisions

Work:

- answer the five user decision gates
- update this plan from `review draft` to `approved plan`
- update [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md) only after direction is approved

Exit:

- role model, signup mode, invitation authority, access request target, and realtime scope are locked

### 1. Role Contract And Capability Helpers

Owner:

- Codex

Work:

- add an expanded RBAC contract section or follow-up contract file
- define capability helpers rather than route-local string checks
- map each API group to read, edit, manage, or admin capability
- update UI copy labels for viewer/editor/manager/admin

Exit:

- code has one source of truth for project capabilities
- permission matrix is reflected in code-facing helpers

### 2. Schema And Migration

Owner:

- Codex
- user approval required before any cloud DB migration

Work:

- update Prisma enum/model changes
- add migration for role expansion
- add invitation and access request tables if approved
- update local store compatibility data
- add safe migration/backfill report

Exit:

- existing memberships remain valid
- current project members are mapped according to the approved role decision

### 3. Guard, API, RLS, And Storage Policy Update

Owner:

- Codex

Work:

- update `requireProjectAccess` and manager guard semantics
- add editor-capability guard for workspace writes
- update task/file/project/admin API role requirements
- update RLS and Storage policies
- add direct positive and negative probes:
  - viewer read allowed
  - viewer write denied
  - editor write allowed
  - editor membership management denied
  - manager membership management allowed
  - non-member denied
  - global admin bypass allowed

Exit:

- API and policy behavior match the matrix

### 4. Invitation Workflow

Owner:

- Codex

Work:

- create invitation APIs:
  - list project invitations
  - create invitation
  - revoke invitation
  - accept invitation
- add email-token acceptance path
- defer actual email sending until the token workflow is verified unless a mail provider is selected
- expose copyable invite links for Preview verification

Exit:

- manager/admin can create a pending invitation
- invited user can accept and receive the intended membership
- revoked/expired invitations fail safely

### 5. Access Request And Pending Access

Owner:

- Codex

Work:

- implement pending profile behavior if approved
- add access request APIs
- add approval/rejection APIs
- update no-access or pending-access UX
- ensure pending users cannot reach normal workspace APIs

Exit:

- unaffiliated sign-in has a stable, non-broken outcome
- approved request creates membership
- rejected request does not grant access

### 6. Collaboration Management UX

Owner:

- Codex

Work:

- update project member management UI:
  - current members
  - role selector
  - pending invitations
  - access requests
- add viewer read-only board UX:
  - no create/edit/reorder/upload controls
  - read-only indicator
  - clear action-denied copy if a stale UI tries to mutate
- add editor/manager distinction in project settings

Exit:

- role differences are visible and understandable without relying on API errors

### 7. Realtime Refresh / Invalidation

Owner:

- Codex

Work:

- add project-scoped event source
- publish events after task, file, project settings, membership, invitation, or access-request mutations
- subscribe only for current project and authenticated project members
- refresh affected client data instead of merging edits in place
- keep local draft recovery intact

Exit:

- a change in one session prompts another session to refresh relevant project data
- stale editors still use existing conflict handling

### 8. Presence And Active Editor Signals

Owner:

- Codex

Work:

- add optional project presence channel
- show who is currently viewing the project
- show active task/editor hints without locking the record
- do not block saves only because another user is present

Exit:

- users can see collaboration context
- write correctness still depends on server conflict checks

### 9. Preview Verification

Owner:

- Codex for local/automated checks
- user only when cloud dashboard or browser identity access is required

Minimum Preview matrix:

- admin
- manager
- editor
- viewer
- pending/no-access user
- invited user before acceptance
- invited user after acceptance
- rejected request user

Required checks:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run deps:audit`
- Prisma validation/generation when schema changes
- role matrix API probes
- RLS and Storage policy probes
- browser UX checks for viewer read-only and manager invitation flows

Exit:

- expanded collaboration works in Preview without reopening completed Phase 1 behavior

## Rollout Rules

- Do not run cloud DB migrations without an explicit backup and user approval.
- Apply schema and policy changes to Preview before Production.
- Keep Production promotion separate from this plan unless the user explicitly resumes production deployment.
- Do not add email sending until invitation token acceptance works with copyable links.
- Do not expose project names to pending users unless Gate 4 approves a public directory.
- Do not implement full live document editing before refresh/invalidation and presence are stable.

## Documentation Updates After Approval

After the user approves direction:

- update [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md) with the new post-Phase 1 contract
- update [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md) to mark this plan as the active post-Phase 1 work order
- add implementation worklogs per slice under `docs/worklogs/`

## Open Questions For User Review

1. Should existing project `member` users become project `editor` users?
2. Should unaffiliated Google users be allowed to create a pending profile, or should access remain invite-only?
3. Can project managers invite editors, and can they promote another user to manager?
4. Should pending users request access generally, or request access to a specific project through an invite/access link?
5. Is project-scoped refresh/invalidation an acceptable first realtime milestone?
