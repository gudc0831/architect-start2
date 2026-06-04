# Collaboration Preview Verification Checklist

- Created: 2026-04-30
- Scope: Preview-only verification for the post-Phase 1 collaboration expansion
- Production: out of scope
- Source plan: [2026-04-28-collaboration-expansion-plan.md](2026-04-28-collaboration-expansion-plan.md)
- Runbook: [2026-04-29-collaboration-expansion-implementation-instructions.md](2026-04-29-collaboration-expansion-implementation-instructions.md)

## Current Baseline

Code and Preview DB are ready for verification:

- `viewer`, `editor`, `manager`, and `admin` capability foundations are implemented.
- Invitation bootstrap, pending profiles, and access requests are implemented.
- Viewer read-only workspace UX and collaboration management UI foundations are implemented.
- Project refresh polling, Supabase Presence, active editor display, and task-field edit leases are implemented.
- Preview migration `202604290004_add_edit_leases` was applied after backup and user approval.
- Latest known GitHub checks for commit `1b534c5` passed: `typecheck`, `lint`, `build`, `deps-audit`, `semgrep`, `CodeQL`, and Vercel Preview Comments.

Existing unrelated untracked files must remain untouched:

- `awesome-design-md/`
- `preview-baseline.sql`

## Local Recheck Before Browser Verification

Run if any code changes occur before Preview testing:

```powershell
npm run typecheck
npm run lint
npm run build
npm run deps:audit
npx prisma validate
npm run data:doctor
```

Expected:

- commands exit `0`
- existing lint hook warnings may remain warnings only
- existing Turbopack data-guard warnings may remain warnings only
- `data:doctor` reports cloud migration status clean and no write lock

## Preview Accounts Needed

Use distinct browser sessions or profiles where possible:

- global admin
- project manager
- project editor
- project viewer
- pending or no-access user
- invited user before acceptance
- invited user after acceptance
- rejected request user

If a role/account is missing, stop the affected test and record the missing account instead of changing production or unrelated baselines.

## Automation Boundary

Codex may verify logged-in Preview behavior with Supabase Admin-generated magic links when the user has approved Preview test data. This is allowed for role, route, API, UI, invitation, access-request, presence, and edit-lease checks because it still exercises the app's Supabase callback, SSR session cookies, post-login funnel, and app guards.

Magic-link verification does not replace final real Google OAuth provider verification. Real Google OAuth requires the browser to complete Google's account picker/consent path with a real Google identity. Leave that final provider check to the user unless they explicitly provide an interactive browser identity path.

Directly opening a Supabase Admin magic link in this app is not a valid substitute for the SSR OAuth callback because the generated magic link returns tokens in the URL fragment instead of the `code` expected by `/auth/callback`. For automated Preview checks, use the API probe below, which keeps temporary Supabase sessions in memory and does not write browser storage state to disk.

## Automated Preview API Probe

Script:

```powershell
$env:PREVIEW_BASE_URL = "<active-preview-root>"
$env:VERCEL_SHARE_URL = "<temporary-vercel-share-url-if-preview-auth-is-enabled>"
npx tsx scripts/preview-collaboration-api-probe.ts
```

Latest result:

- 2026-04-30: passed against Project B `2150d595-0570-4309-9198-031e90668af4`.
- Covered: viewer session identity, viewer member names/emails, viewer read-only task and lease denial, editor task create, editor manager-route denial, manager member route, manager same-field lease conflict, manager different-field lease success, manager manager-invite denial, manager manager-request approval denial, pending/no-access no project inventory, pending manager self-request denial, admin global access-request listing.
- Cleanup: probe task was moved to trash and permanently deleted through app APIs.
- Not covered: real Google OAuth provider UI, actual browser-rendered collaboration UX, file upload/download browser flow, invitation acceptance with real provider account, positive manager approval of viewer/editor access request, positive admin approval of manager request.

## Final Google OAuth Checklist For User

Run this only after the magic-link/browser Preview matrix is otherwise complete.

- Open the active Preview URL in a clean browser profile or incognito window.
- Pass Vercel Preview Authentication if the deployment is protected.
- Go to `/login`.
- Click `Google로 계속`.
- Choose the intended real Google account.
- Confirm Google redirects back to `<preview-root>/auth/callback`.
- Confirm the app then routes through `/auth/post-login`.
- Confirm the final app outcome for each real account:
  - global admin reaches admin/project workspace as expected
  - project manager reaches the managed project and management UI
  - no-access or pending user reaches `/auth/no-access` or `/auth/pending-access`
- Confirm no external `next` or unsafe redirect is accepted during login.
- Record the Preview URL, account email, final route, and pass/fail result in the verification worklog.

## Role And Access Checks

Verify in Preview:

- viewer can open project board/daily/calendar/trash read surfaces
- viewer can see project member names and email addresses
- viewer cannot create, update, reorder, delete, restore, or permanently delete tasks
- viewer cannot upload, version, trash, restore, delete, or download unauthorized files
- editor can create, update, reorder, and trash normal workspace tasks
- editor can upload and version files
- editor cannot invite, approve access requests, or manage membership
- manager can invite `viewer` and `editor`
- manager cannot invite, grant, revoke, or approve `manager`
- manager can approve access requests only as `viewer` or `editor`
- admin can approve, grant, and revoke `manager`
- pending user cannot list projects or access normal workspace APIs

## Invitation And Access Request Checks

Verify in Preview:

- invited Google user without an app profile can accept a valid invitation
- invitation acceptance creates or activates the app profile before normal app guards are required
- accepted invitation creates membership with the invitation role
- wrong Google email cannot accept the invitation
- revoked invitation cannot be accepted
- expired invitation cannot be accepted if an expired invite is available for test
- pending user can submit the allowed access request type
- approved request creates only the approved role
- rejected request keeps audit history and does not create membership

## Collaboration Checks

Use at least two simultaneous sessions in the same project:

- session A changes a task; session B sees the loaded scope refresh or update
- session A uploads or changes a file; session B sees file data refresh
- session A opens the project; session B sees project presence
- session A selects a task; session B is not blocked from editing
- session A enters inline edit mode for one field; session B sees active editor context
- session B cannot enter edit mode for the same task field while session A holds the lease
- session B can enter edit mode for a different field where field-level leasing is used
- session A save or cancel releases the lease
- stale lease expires after the holder stops heartbeating or leaves long enough for TTL expiry

## Result Recording

Create or update a worklog under `docs/worklogs/` after the verification pass.

Record:

- Preview deployment or commit tested
- accounts/roles used
- passed checks
- failed checks with exact route or UI surface
- whether the failure is code, data, environment, or missing account setup
- whether any fix requires a new migration or policy SQL

## Stop Conditions

Stop and ask before:

- applying additional Preview DB migrations or policy SQL
- changing baseline preview users or project memberships beyond the explicit test need
- touching Production env, Production DB, production OAuth settings, or production branch settings
- adding an email delivery provider
- removing the legacy project `member` enum value
- exposing project names to pending users
