# Security Deployment Review

- Updated: 2026-04-10
- Parent index: [../PLAN.md](../PLAN.md)
- Auth and RBAC contract: [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
- Deployment protection contract: [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)
- Execution plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)

## Purpose

This document records the current deployment-relevant security findings from the code review and translates them into a remediation order.

Use this file for:

- release blockers
- concrete security findings
- fix order before cloud rollout
- mapping from findings to active planning documents

## Scope Reviewed

- auth and login flow
- project selection and project mutation routes
- file upload and task mutation routes
- deployment and CI guardrails
- dependency vulnerability posture
- public diagnostics surface

## Release Blockers

These findings should be treated as blockers for internet-facing rollout.

### 1. Project Authorization Bypass

Severity:

- `P1`

Impact:

- an authenticated non-admin user can enumerate or mutate projects outside the intended membership boundary

Evidence:

- [route.ts](/D:/architect%20-%20start2/src/app/api/project/route.ts#L23)
- [admin-service.ts](/D:/architect%20-%20start2/src/use-cases/admin/admin-service.ts#L61)
- [admin-service.ts](/D:/architect%20-%20start2/src/use-cases/admin/admin-service.ts#L113)
- [postgres-store.ts](/D:/architect%20-%20start2/src/repositories/admin/postgres-store.ts#L169)
- [postgres-store.ts](/D:/architect%20-%20start2/src/repositories/admin/postgres-store.ts#L191)
- [project-session.ts](/D:/architect%20-%20start2/src/lib/project-session.ts#L12)

Required remediation:

1. Make project selection membership-filtered for non-admin users.
2. Treat the current-project cookie as a client hint only, never as authorization.
3. Require `requireProjectManager()` for project rename and project-scoped admin mutations.
4. Add negative-path tests for unrelated project selection and rename attempts.

### 2. Open Redirect In Login Flow

Severity:

- `P1`

Impact:

- `/login?next=...` can redirect users to attacker-controlled domains after successful login

Evidence:

- [page.tsx](/D:/architect%20-%20start2/src/app/login/page.tsx#L10)
- [login-form.tsx](/D:/architect%20-%20start2/src/components/auth/login-form.tsx#L45)

Required remediation:

1. Accept only same-site relative redirect targets.
2. Reject protocol-relative and absolute external URLs.
3. Route OAuth callback and post-login flow through one stable internal landing path.

### 3. Missing Request Integrity Checks On Cookie-Authenticated Mutations

Severity:

- `P2`

Impact:

- state-changing APIs rely on cookies but do not document or enforce explicit CSRF or strict Origin validation

Evidence:

- [route.ts](/D:/architect%20-%20start2/src/app/api/files/upload-intents/route.ts#L7)
- [route.ts](/D:/architect%20-%20start2/src/app/api/files/commit/route.ts#L8)
- [route.ts](/D:/architect%20-%20start2/src/app/api/project/route.ts#L23)
- [route.ts](/D:/architect%20-%20start2/src/app/api/tasks/reorder/route.ts#L8)

Required remediation:

1. Define a mutation-request integrity rule for cookie-authenticated POST, PATCH, PUT, and DELETE routes.
2. Enforce strict `Origin` and `Referer` allowlisting or an equivalent CSRF token contract.
3. Verify the rule on project, task, file, and admin mutation routes.

### 4. Vulnerable Direct Dependencies Before Release

Severity:

- `P2`

Impact:

- known advisories remain in internet-facing dependencies used by the deployed app or deployment toolchain

Evidence:

- [package.json](/D:/architect%20-%20start2/package.json#L44)
- [package.json](/D:/architect%20-%20start2/package.json#L55)
- local check: `npm audit --json --omit=dev`

Current notable results:

- `next@16.1.6` reported direct advisories, with a non-major fix available to `16.2.3`
- `prisma` dependency chain reported high-severity advisories

Required remediation:

1. Patch `next` to the current fixed patch line before internet-facing rollout.
2. Review and patch Prisma-related advisories before final release sign-off.
3. Add dependency scanning and update automation to keep these from recurring silently.

### 5. Missing Security Automation In GitHub

Severity:

- `P2`

Impact:

- PRs can merge without SAST, dependency review, or vulnerability update automation

Evidence:

- `.github` missing in the current repo
- no visible GitHub Actions workflows
- no visible Dependabot config

Required remediation:

1. Add GitHub Actions workflows for:
   - CodeQL via `github/codeql-action`
   - Semgrep
   - dependency scanning or audit step
2. Add Dependabot configuration for npm and GitHub Actions.
3. Make security checks part of the protected-branch required checks set.

### 6. Missing Security Header Baseline

Severity:

- `P3`

Impact:

- the app may ship without explicit CSP, `nosniff`, clickjacking controls, or referrer policy unless the edge layer adds them out of band

Evidence:

- [next.config.ts](/D:/architect%20-%20start2/next.config.ts#L1)
- no repo-visible header config found during review

Required remediation:

1. Define the minimum header baseline in the deployment contract.
2. Implement headers in app config or Vercel edge config.
3. Verify at runtime, not only in repo code.

### 7. Public Diagnostics Endpoint

Severity:

- `P3`

Impact:

- deployment and backend mode details are exposed without authentication

Evidence:

- [route.ts](/D:/architect%20-%20start2/src/app/api/system/status/route.ts#L6)

Required remediation:

1. Restrict diagnostics to authenticated or admin-only access, or remove them from public production traffic.
2. If a public health endpoint remains, keep it minimal and non-descriptive.

## Recommended Fix Order

1. Close authorization and redirect flaws:
   - project access enforcement
   - project mutation authorization
   - login redirect sanitization
2. Add request-integrity protection to cookie-authenticated mutation routes.
3. Patch release-critical dependency advisories.
4. Add GitHub security automation and fold it into protected-branch checks.
5. Add header baseline and tighten public diagnostics exposure.
6. Continue the longer RLS and Storage policy rollout already captured in the main plan.

## Planning Impact

This review changes the active plan in four ways:

1. project authorization hardening becomes an explicit early phase, not an implied byproduct
2. login redirect safety and request-integrity rules become locked auth contract items
3. CodeQL, Semgrep, dependency scanning, and Dependabot become deployment baseline items
4. header baseline and diagnostics exposure become deployment review items

## Tooling Interpretation

The requested repositories map well to this project:

- `github/codeql`
  - useful for TypeScript and Next.js static analysis
- `github/codeql-action`
  - the official GitHub Actions runner path for CodeQL in PRs
- `semgrep/semgrep`
  - useful for fast SAST and custom secure-coding checks
- `semgrep/semgrep-rules`
  - useful as a baseline ruleset and source for custom policy ideas
- `google/osv-scanner`
  - useful for dependency vulnerability review
- `bridgecrewio/checkov`
  - useful once this repo contains meaningful IaC or workflow inventory
- `dependabot/dependabot-core`
  - useful conceptually, but operationally the repo should use GitHub Dependabot configuration rather than vendoring its core

## Verification Notes

Reviewed locally:

- route and auth code paths
- deployment and config files visible in the repo
- dependency posture with `npm audit --json --omit=dev`

Not verified here:

- live Vercel header behavior
- live GitHub branch protection settings
- live Supabase RLS or Storage policy state

## Sources

- [CodeQL](https://github.com/github/codeql)
- [CodeQL Action](https://github.com/github/codeql-action)
- [Semgrep](https://github.com/semgrep/semgrep)
- [Semgrep Rules](https://github.com/semgrep/semgrep-rules)
- [OSV-Scanner](https://github.com/google/osv-scanner)
- [Checkov](https://github.com/bridgecrewio/checkov)
- [Dependabot Core](https://github.com/dependabot/dependabot-core)
- [GitHub CodeQL docs](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)
