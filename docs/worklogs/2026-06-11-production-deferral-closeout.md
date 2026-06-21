# Production Deferral Closeout

Date: 2026-06-11 KST

## Decision

After the current Preview AI review / verified legal / Browser Assistant closure,
Production release execution is deferred. This closeout updates the plan surface
so the repository does not imply that Production is ready or already promoted.

## Proceeded Now

- Closed stale same-task saved-record wording for canonical Preview task `117`.
- Added a Production resume gate to the verified legal centralization plan.
- Marked the April deployment/release docs as the April baseline, not the June
  AI review Production approval.
- Added a Preview drift guard for alias/env/auth-origin/Browser Assistant origin
  changes.
- Documented the verified-legal Vercel adapter as Preview-only until a separate
  Production release record is created.

## Deferred

Do not perform these steps in the current closeout:

- Production Vercel env changes.
- Production deployment or alias promotion.
- Production DB migration, seed, bootstrap, or data write.
- Production Supabase Auth / Google OAuth callback changes.
- Chrome Web Store upload.
- Signed native-host installer release.
- Production legal scheduler/Cron enablement.
- Full production corpus refresh or pgvector/embedding scale-up.

## Repo Snapshot

Current HEADs captured before this closeout is committed:

- `architect-saas`: `61913f10141f07834ba1bb9430489ac549708caf` on `codex/multi-user-transition`.
- `verified-legal-evidence-api`: `4f050c8913a6ac2fc9028dce15e3627fe5d7fa92` on `main`.
- `architect-browser-assistant`: `47d60290eb21f2dbe12e4ebfce46761471b7f1a9` on `main`.

Working-tree note:

- `architect-saas` already had uncommitted documentation changes before this
  closeout and now includes this deferral documentation update.
- `verified-legal-evidence-api` already had uncommitted Vercel adapter/runbook
  changes before this closeout and now includes the Preview-only boundary
  update.
- `architect-browser-assistant` was clean at the snapshot and is not changed by
  this closeout.

## Preview Proof Boundary

Latest recorded Preview proof remains Preview-only:

- Canonical SaaS Preview host:
  `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`.
- Canonical SaaS Preview deployment:
  `dpl_FHnaZWqidgSqAYAFwXJq1andRZEd`.
- Verified legal Preview target:
  `https://verified-legal-evidence-hp5490x70-chois-projects-7b2948cf.vercel.app`.
- Verified legal Preview deployment:
  `dpl_GswMEwfdkZGrBxdMyfA8MnNktfx2`.
- Browser Assistant fix:
  `architect-browser-assistant` commit `47d60290eb21f2dbe12e4ebfce46761471b7f1a9`.
- Same-task saved-record proof:
  task `117`, assistant record `609f065a-e17c-4f1a-a968-50593832037a`,
  `executionMode: local-chatgpt-codex`,
  `runtimeMode: extension-native-bridge-in-page`,
  `candidateState: candidate`.

The authenticated shell completion smoke remains optional unless
`ARCHITECT_SMOKE_COOKIE` is intentionally provided. Do not inspect or record
browser session stores just to obtain a cookie.

## Production Resume Gate

Before Production release execution resumes, verify and record:

- Production `architect-saas` env shape with production-only Supabase/Postgres
  and verified legal variables.
- `LAW_OPEN_DATA_OC` remains absent from `architect-saas`.
- Production `verified-legal-evidence-api` target and app secret parity.
- Vercel deployment protection and bypass policy for production.
- Production `NEXT_PUBLIC_SITE_URL`, `/auth/callback`, Supabase Auth Site URL,
  Supabase redirect URL, and Google provider redirect URI.
- Browser Assistant production origin allowlist, Web Store metadata, signed
  native-host installer, production install root, and extension id.
- Authenticated production smoke for `/daily`, centralized verified legal task
  review, Local Codex/native bridge saved records, and WIKI candidate boundary.

## Validation Notes

This closeout is documentation-only. It intentionally does not run Production
release commands, mutate env values, deploy aliases, write production data, or
print secrets.
