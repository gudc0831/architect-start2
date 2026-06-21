# Release Readiness Sign-Off

- Updated: 2026-06-11
- Status: non-production readiness complete; production promotion deferred; June 2026 AI review / verified legal Preview closeout is separate from production release execution
- Active plan: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)
- Deployment contract: [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)
- June 2026 closeout: [worklogs/2026-06-11-production-deferral-closeout.md](worklogs/2026-06-11-production-deferral-closeout.md)

## 2026-06-11 Addendum

This sign-off remains the April deployment baseline. It must not be read as production approval for the June 2026 AI review / verified legal / Browser Assistant path.

The current June state is:

- Preview-only AI review / verified legal integration is recorded in the cross-project and centralization plans.
- Production release execution is intentionally deferred.
- No production Vercel env changes, production deployment, production alias promotion, production DB write, production OAuth callback change, Chrome Web Store upload, or native-host signing is authorized by this document.

Before Production release resumes, the Production resume gate in `docs/superpowers/plans/2026-06-09-verified-legal-centralization-plan.md` must be completed.

## Verified Preview Evidence

Latest PR head checked for CI and Vercel status:

- commit: `dabb052fc6c432c9d5383773b4582cbf3d14416d`
- Vercel deployment: `dpl_Deo4zKSKC2uMuurP7xxn4tMEG6Wj`
- deployment state: `READY`
- GitHub/Vercel status: `success`

Latest app-visible Preview header smoke checked:

- commit: `3199f006366672b25a22d0ca36e6a169c1133358`
- Vercel deployment: `dpl_6EzQmCbdjRdMw1J3ghGBzFNbU4UY`
- Preview URL: `https://architect-start2-gjsrsprm1-chois-projects-7b2948cf.vercel.app`
- branch alias: `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`
- deployment state: `READY`
- GitHub/Vercel status: `success`

Do not collapse these two evidence points into one "latest deployment" statement. The PR/check evidence is from `dabb052`; the app-visible runtime header smoke is from `3199f00`.

GitHub checks passed on the latest PR head:

- `typecheck`
- `lint`
- `build`
- `deps-audit`
- `semgrep`
- `CodeQL`
- `codeql`
- Vercel Preview Comments

Runtime header smoke on `GET /login` through the Vercel-protected Preview URL returned `200` and included:

- `Content-Security-Policy: base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'`
- `Permissions-Policy: camera=(), geolocation=(), microphone=()`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-Robots-Tag: noindex`

Other preview release checks already completed in linked worklogs:

- Google OAuth login for admin/member/no-access
- app-level auth/RBAC guard probes
- request-integrity probes
- Preview RLS and Storage policy probes
- Project B file upload, signed download, failed-commit cleanup, and final data cleanup against Preview DB/Storage

## Production Sign-Off Inputs Needed

These require dashboard access or a user-provided exact value before production promotion:

Current production status confirmed by user on 2026-04-24:

- Production root URL: not set yet.
- Vercel Production Project env contains `APP_BACKEND_MODE=cloud`.
- Vercel Production Project env does not show the required Supabase/Postgres variables.
- Vercel Production Shared env has no linked variables.
- The exact Vercel Production Branch setting has not been dashboard-confirmed; expected direction is the protected production branch, currently `main` unless a dedicated release branch is explicitly documented later.
- Therefore production deploy/promotion is intentionally not ready.

1. Production app URL
   - Choose the exact production root URL.
   - Current Vercel project domains observed:
     - `https://architect-start2-git-main-chois-projects-7b2948cf.vercel.app` returns Vercel Authentication `401`.
     - `https://architect-start2-chois-projects-7b2948cf.vercel.app` currently returns `DEPLOYMENT_NOT_FOUND`.
   - Do not assume either is the production URL until the user confirms the intended production domain.
2. Vercel Production environment variables
   - `APP_BACKEND_MODE=cloud`
   - `NEXT_PUBLIC_SITE_URL=<exact production root URL>`
   - `DATABASE_URL` points to the production Supabase/Postgres database, not Preview.
   - `NEXT_PUBLIC_SUPABASE_URL` points to the production Supabase project, not Preview.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` belongs to the production Supabase project.
   - `SUPABASE_SERVICE_ROLE_KEY` belongs to the production Supabase project and remains server-only.
   - `SUPABASE_STORAGE_BUCKET` is the production bucket name.
   - `VERIFIED_LEGAL_EVIDENCE_API_URL` points to the production verified legal API target, not a Preview URL.
   - `VERIFIED_LEGAL_EVIDENCE_API_SECRET` matches the production verified legal API server secret and is never exposed to the browser.
   - `LAW_OPEN_DATA_OC` remains absent from `architect-saas`; official legal-source credentials stay in `verified-legal-evidence-api`.
   - No Preview Supabase host, database password, anon key, or service-role key is assigned to Production.
   - No Preview verified legal API URL, Preview bypass secret, or Preview Browser Assistant origin is assigned to Production.
3. Supabase production Auth URL configuration
   - Site URL equals the exact production root URL.
   - Additional redirect URL includes the exact production callback:
     - `<exact production root URL>/auth/callback`
   - Preview branch wildcard or Preview URL belongs only in the Preview Supabase project unless a future production routing plan explicitly says otherwise.
4. Google OAuth provider configuration for the production Supabase project
   - Google authorized redirect URI includes the production Supabase provider callback:
     - `https://<production-supabase-project-ref>.supabase.co/auth/v1/callback`
   - The production Supabase project uses the intended Google OAuth client credentials.
5. Verified legal production target
   - Production `verified-legal-evidence-api` target is selected or deployed.
   - The SaaS server can call protected legal evidence/search endpoints with the production app secret and any approved Vercel protection bypass policy.
   - Direct browser access to protected legal evidence routes remains blocked.
6. Browser Assistant production release path
   - Production SaaS origin is in the extension allowlist.
   - Web Store publisher metadata, release owner, extension id, signed native-host installer, and production install root are finalized.
   - The readiness path passes without relying on the unsigned interim waiver unless that waiver is explicitly approved for the release.

## Production Promotion Checklist

Before merge or production deploy:

1. Confirm the production URL and dashboard values above.
2. Confirm the PR head still has all required checks passing.
3. Approve any production DB backup, migration, seed, or bootstrap step explicitly before running it.

After production deploy:

1. Verify `/login` returns `200` and Google OAuth starts against the production Supabase project.
2. Verify `/auth/callback` completes only with the production callback configuration.
3. Verify `/api/system/status` is authenticated and no-store at the app layer.
4. Verify runtime headers match the preview baseline:
   - CSP
   - `X-Content-Type-Options`
   - clickjacking protection
   - `Referrer-Policy`
   - `Permissions-Policy`
   - HSTS
5. Verify admin/member/no-access outcomes if production accounts are provisioned for smoke testing.
6. Verify `/daily` AI review on the production host:
   - centralized verified legal evidence retrieval
   - Local Codex/native bridge availability
   - assistant saved record persistence
   - WIKI candidate state remains `candidate` and no admin approval is bypassed

## Current Blocker

Production promotion is blocked on the exact production URL, production-only Vercel env vars, production verified legal API target/secret parity, Vercel protection/bypass policy, Browser Assistant production release path, and authenticated production smoke. Supabase Auth URLs and Google OAuth redirect URI should be configured only after the production URL and production Supabase project are chosen.
