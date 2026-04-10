# Deployment And Release Protection Contract

- Updated: 2026-04-10
- Parent index: [../PLAN.md](../PLAN.md)
- Auth and RBAC contract: [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
- Execution plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)

## Purpose

This document locks the minimum deployment and release protection rules for the cloud rollout.

Use this file for:

- private-repo GitHub protection rules
- required CI checks
- security automation baseline
- Vercel environment separation
- release header and diagnostics expectations
- merge and release flow expectations

## Locked Direction

### 1. Private Repo Baseline

The repository is operated as a private repo.

Baseline release safety does not depend on GitHub environment required reviewers.

Reason:

- protected branches and required status checks are the dependable baseline for private repos
- GitHub environment reviewers and some deployment protection features vary by plan and repo visibility

Therefore the hard baseline is:

- protected production branch
- required checks
- PR review requirements
- Vercel environment separation

If plan or visibility changes later, environment reviewers can be added on top, not in place of the baseline.

### 2. Protected Branch Model

Apply branch protection to:

- the production branch used by Vercel production
- any dedicated release branch if the repo later separates `main` and `release`

Minimum settings:

- require pull request review before merging
- require at least one approval
- dismiss stale approvals when the diff changes
- require approval for the most recent reviewable push
- require conversation resolution before merging
- require status checks before merging
- do not allow bypassing by default
- block force pushes
- block branch deletion

Recommended when the repo stabilizes:

- require linear history
- require signed commits
- enable merge queue if merge traffic becomes high

### 3. Required Checks

Minimum required checks:

- `typecheck`
- `lint`
- `build`
- `codeql`
- `semgrep`
- `deps-audit`

Recommended follow-up checks:

- preview auth smoke
- preview policy probe
- preview multi-user access smoke

Rules:

- required job names must be unique across workflows
- required checks should come from the expected GitHub App or workflow source when possible
- production branch merges should be blocked when any required check is missing or ambiguous

### 4. Security Automation Baseline

Use the following baseline for this repo:

- CodeQL
  - use `github/codeql-action`
  - run on pull requests and the protected production branch
- Semgrep
  - run a repository SAST pass on pull requests
- dependency scanning
  - run an audit or dependency scan in CI
  - patch direct release dependencies when a fixed version is available and the issue is release-relevant
- Dependabot
  - configure updates for `npm`
  - configure updates for GitHub Actions once workflows exist

Conditional tool:

- Checkov
  - add it when the repo grows meaningful IaC, Docker, or GitHub Actions surface that benefits from policy scanning

Current repo note:

- the repo currently has no `.github` workflow inventory, so these checks must be introduced before relying on them as required protections

### 5. Require Deployments Before Merge

When GitHub and Vercel deployment statuses are available, require preview or staging deployment success before merging to the production branch.

This is the preferred guardrail for cloud rollout because the auth and environment path is part of correctness, not a separate concern.

### 6. Vercel Environment Separation

Use Vercel environments as distinct operating targets:

- `development`
  - local development only
  - local `.env.local` or pulled development env values
- `preview`
  - PR and branch validation
  - test Supabase project only
  - preview-specific redirect URLs
- `production`
  - live deployment
  - production Supabase project only
  - exact production redirect URLs only

Rules:

- preview and production never share Supabase database credentials
- preview and production never share storage buckets unless a future migration plan says otherwise
- sensitive preview and production env vars should be stored as protected project env vars
- branch-specific preview overrides are allowed only for preview, not for production

### 7. Vercel URL And Auth Rules

- `NEXT_PUBLIC_SITE_URL` should point to the production app URL in production
- preview redirects may use `NEXT_PUBLIC_VERCEL_URL` or branch preview URLs
- Supabase redirect allow lists must include localhost, preview wildcard, and the exact production URL
- production should use exact redirect paths, not broad wildcard matching

### 8. Security Header And Diagnostics Baseline

Baseline headers for internet-facing production:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- clickjacking control through `frame-ancestors` or `X-Frame-Options`
- `Referrer-Policy`
- `Permissions-Policy` when practical

Rules:

- headers may be set in app config or at the Vercel edge, but they must be verifiable at runtime
- public diagnostics or status endpoints must not expose backend mode, storage mode, or environment-presence details unless there is an explicit operational reason
- a public health endpoint, if kept, should be minimal and non-descriptive

### 9. Release Flow

Expected flow:

1. local development and local verification
2. PR opened against the protected production branch
3. required checks pass
4. preview deployment succeeds
5. preview auth and policy smoke tests pass
6. preview security smoke passes:
   - redirect handling
   - key authorization paths
   - header baseline
7. PR is approved and merged
8. production deploy runs
9. manual DB migration, seed, or bootstrap steps run only when explicitly needed

## Operational Notes

- Keep DB migration execution separate from app deployment.
- Keep backup execution separate from app deployment.
- Do not rely on Vercel deployment protection features as the only shield unless the team plan explicitly supports the chosen mode.
- If preview URLs must stay internal-only, add Vercel deployment protection as an extra layer when the plan supports it.

## Verification Checklist

Before treating the release path as ready:

1. The active production branch is protected.
2. Required checks are configured and actually block merges.
3. The required check names match real workflow job names.
4. CodeQL and Semgrep are active on pull requests or the protected production branch.
5. Dependabot is configured for npm and GitHub Actions when workflows exist.
6. Preview deployments point to preview or test Supabase only.
7. Production deployments point to production Supabase only.
8. Redirect allow lists match preview and production URL strategy.
9. Runtime production responses show the expected header baseline.
10. A failing preview auth, policy, or dependency-security check prevents merge or release sign-off.

## Change Control

Revise this document before implementation if any of the following change:

- the production branch naming strategy
- repository visibility
- GitHub plan level and environment protection capabilities
- Vercel environment model
- preview or production Supabase isolation rules
