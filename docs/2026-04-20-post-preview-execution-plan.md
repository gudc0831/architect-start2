# Post-Preview Execution Plan

- Updated: 2026-04-20
- Parent index: [../PLAN.md](../PLAN.md)
- Base implementation plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- Locked auth contract: [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
- Deployment guardrails: [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)
- Latest preview verification log: [worklogs/2026-04-20-preview-auth-verification-and-password-route-restriction.md](worklogs/2026-04-20-preview-auth-verification-and-password-route-restriction.md)
- Remaining preview verification matrix: [2026-04-20-preview-verification-expansion-matrix.md](2026-04-20-preview-verification-expansion-matrix.md)

## Purpose

This document turns the earlier multi-user transition plan into a concrete post-preview execution order.

Use this file when the question is:

- what is already proven in preview
- what still blocks Phase 1 completion
- what Codex can do immediately without waiting
- where the user must step in for dashboard, account, or external-system actions
- what order should be used from today forward

This file does not reopen the locked auth or RBAC decisions.

## Verified Baseline As Of 2026-04-20

The following was verified against the preview deployment and the preview Supabase project:

- Google OAuth login succeeds for:
  - `admin` account
  - `member` account
  - `no-access` account
- post-login routing behaves correctly for:
  - `admin` -> workspace
  - `member` -> workspace
  - `no-access` -> dedicated no-access screen
- invalid external `next` values fall back to an internal route
- `/api/system/status` is authenticated and returns `UNAUTHORIZED` when anonymous
- preview runtime headers include:
  - `Content-Security-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - auth-sensitive `Cache-Control`
- the transitional password login route remains present only as a controlled utility and is no longer a normal preview or production entry path

## Remaining Gaps From The Base Plan

The earlier plan is not fully complete yet. The main remaining gaps are:

- Phase 0 leftovers:
  - GitHub security automation
  - required checks
  - branch protection
  - second project with a distinct membership set
  - at least one `manager` verification path
  - release-relevant dependency patching
- Phase 1 to 3 verification leftovers:
  - direct API negative-path checks for unrelated project or manager-only paths
  - explicit invalid or missing origin mutation checks in the release-ready flow
  - exact production OAuth callback verification
- Phase 4 to 6 implementation work:
  - Postgres RLS
  - Storage policies
  - assignee-to-profile linkage
  - concurrency hardening
- Phase 7 follow-up:
  - conflict recovery UX for `409` paths
- Phase 8 follow-up:
  - realtime invalidation work

## Ownership Rule

Default rule:

- Codex moves first on every repo-only task.
- The user is asked only at true external gates:
  - Vercel settings
  - GitHub repository protection settings
  - Google or Supabase dashboard actions
  - preview or production data mutations that should not be done silently
  - browser-only verification using real user accounts

## Working Mode From Today

The operating rule from this point is:

1. Codex completes all repo-only preparation first.
2. Codex stops only at a true external gate and asks for that one user action.
3. After the user completes that gate, Codex resumes the next repo-owned slice immediately.

This keeps the work moving without turning every next step into a manual dashboard task.

## Execution Order

### Step 1. Repo-Only Deployment Baseline Work

Owner:

- Codex

Work:

- add GitHub Actions for:
  - `typecheck`
  - `lint`
  - `build`
  - `deps-audit`
  - `codeql`
  - `semgrep`
- add Dependabot config for:
  - `npm`
  - GitHub Actions
- keep workflow job names stable so they can become required checks

Why before more browser QA:

- the deployment contract treats these as release baseline, not optional cleanup
- this work does not require the user to pause for dashboard actions

Exit:

- CI and security automation live in the repo
- required-check names are known and stable

### Step 2. Dependency Patch Pass

Owner:

- Codex

Work:

- review release-relevant dependency advisories
- patch low-risk direct dependency fixes where practical
- isolate higher-risk upgrades into explicit follow-up notes if they are not safe to batch with CI work

Why here:

- the deployment protection contract and security review both treat dependency posture as an active release input

Exit:

- direct low-risk fixes are landed or
- a short blocked upgrade list exists with exact versions and reasons

### Step 3. Preview Verification Expansion Preparation

Owner:

- Codex

Work:

- prepare a verification matrix for the remaining preview gaps:
  - second project
  - `manager` user path
  - unrelated project negative path
  - manager-only mutation negative path
  - invalid and missing origin mutation probes
- prepare the smallest safe preview test-data shape needed to run those checks
- prefer scripts or exact SQL/dashboard instructions over ad hoc manual edits

Why here:

- current preview verification proved the auth core, but not the full membership and manager matrix required by the base plan
- this preparation does not require an immediate external-system mutation

Exit:

- exact remaining preview checks documented
- exact preview data additions documented

### Step 4. External Protection And Platform Settings Gate

Owner:

- user

Work:

- re-enable Vercel preview authentication that was temporarily disabled for no-access testing
- enable GitHub branch protection on the production branch
- make the new workflow checks required
- confirm preview and production environment separation remains correct

Why the user is needed:

- repository protection and Vercel project settings are external controls

Exit:

- protected branch active
- required checks active
- preview protection active again

### Step 5. Preview Data Gate

Owner:

- user approval, then Codex or user execution

Work:

- approve creation of:
  - one additional preview project
  - one `manager` membership path
  - one unrelated non-member path across projects
- after approval:
  - Codex may apply the change through the preview database path, or
  - the user may apply the prepared dashboard or SQL steps

Why the user is needed:

- this is an external-system data mutation
- it changes the preview verification surface intentionally

Exit:

- preview test data exists for full membership and manager verification

### Step 6. Remaining Preview Verification

Owner:

- user for browser execution
- Codex for coordination, result interpretation, and any follow-up fixes

Work:

- run the remaining browser and API checks:
  - manager can perform manager-only actions
  - member cannot perform manager-only actions
  - unrelated authenticated user cannot access another project
  - invalid origin mutation is rejected
  - missing origin mutation is rejected according to the chosen rule
  - exact production callback strategy is ready or separately scheduled

Why here:

- this closes the remaining Phase 0 to 3 verification contract items before moving deeper into Phase 4 to 6 work

Exit:

- preview verification matrix is complete enough to stop revisiting auth basics

### Step 7. Policy Boundary Slice

Owner:

- Codex first for design and repo work
- user approval for preview policy rollout timing

Work:

- inventory browser-facing data and storage paths
- design the RLS and storage policy model for the current app surface
- implement policy SQL and any matching server-side adjustments in a dedicated slice
- roll policies to preview first

Why after preview auth verification:

- the base plan explicitly treats app guards plus RLS plus storage policy as the long-term security boundary
- auth verification is now strong enough to move deeper

Exit:

- preview policies exist
- unrelated authenticated access is denied at the database or storage boundary

### Step 8. Assignee Linkage Slice

Owner:

- Codex

Work:

- add `assigneeProfileId`
- preserve the legacy assignee display snapshot
- scope assignee choices to project members
- handle unresolved backfill safely

Why after policy work:

- this is still Phase 1 scope, but it is less urgent than the security boundary

Exit:

- assignment data is tied to actual profiles
- unresolved legacy data fails safely

### Step 9. Concurrency Hardening Slice

Owner:

- Codex

Work:

- make task number creation transaction-safe
- add reorder conflict handling
- add file next-version conflict protection
- return clear `409` responses for collision paths

Why late in Phase 1:

- auth correctness and security boundaries are higher priority
- this slice is still required before claiming Phase 1 completion

Exit:

- main concurrent write races return recoverable results instead of silent corruption

### Step 10. Conflict UX And Release Readiness Pass

Owner:

- Codex, then user for final production-adjacent checks

Work:

- improve conflict and recovery UX where new `409` paths surface
- run a final preview sign-off pass
- confirm production callback URL setup and release sequencing

Exit:

- Phase 1 completion criteria can be checked honestly

### Step 11. Realtime Follow-Up

Owner:

- Codex

Work:

- treat realtime invalidation as a separate follow-up after Phase 1 correctness closes

Exit:

- work begins only after security and consistency foundations are stable

## What Codex Can Start Immediately

Without waiting for the user, Codex can start:

- repo CI and security automation
- dependency patch review and low-risk upgrades
- remaining preview verification matrix and exact data plan
- RLS and storage policy inventory and design preparation

## What The User Will Be Asked For Mid-Stream

The expected user gates are:

1. restore Vercel preview authentication and enable branch protection plus required checks after Codex lands the repo-side CI baseline
2. approve preview test-data expansion for second-project and manager-path verification
3. run browser verification for manager and unrelated-user paths
4. approve preview rollout timing for RLS and storage policy changes

## Review Notes

This plan was reviewed twice against:

- [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
- [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)
- [2026-04-10-security-deployment-review.md](2026-04-10-security-deployment-review.md)
- [worklogs/2026-04-20-preview-auth-verification-and-password-route-restriction.md](worklogs/2026-04-20-preview-auth-verification-and-password-route-restriction.md)

Review result:

- proceed

Reason:

- the current auth preview slice is verified enough to stop reworking login basics
- the remaining work now falls into deployment baseline, verification expansion, policy boundary, data-shape hardening, and concurrency
- the user gates are all external-system actions rather than repo-local implementation work
