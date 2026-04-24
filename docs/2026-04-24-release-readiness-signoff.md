# Release Readiness Sign-Off

- Updated: 2026-04-24
- Status: preview automation complete; production dashboard sign-off pending
- Active plan: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)
- Deployment contract: [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)

## Verified Preview Evidence

Latest PR head checked:

- commit: `3199f006366672b25a22d0ca36e6a169c1133358`
- Vercel deployment: `dpl_6EzQmCbdjRdMw1J3ghGBzFNbU4UY`
- Preview URL: `https://architect-start2-gjsrsprm1-chois-projects-7b2948cf.vercel.app`
- branch alias: `https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`
- deployment state: `READY`
- GitHub/Vercel status: `success`

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
   - No Preview Supabase host, database password, anon key, or service-role key is assigned to Production.
3. Supabase production Auth URL configuration
   - Site URL equals the exact production root URL.
   - Additional redirect URL includes the exact production callback:
     - `<exact production root URL>/auth/callback`
   - Preview branch wildcard or Preview URL belongs only in the Preview Supabase project unless a future production routing plan explicitly says otherwise.
4. Google OAuth provider configuration for the production Supabase project
   - Google authorized redirect URI includes the production Supabase provider callback:
     - `https://<production-supabase-project-ref>.supabase.co/auth/v1/callback`
   - The production Supabase project uses the intended Google OAuth client credentials.

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

## Current Blocker

Production promotion is blocked on the exact production URL and dashboard confirmation for Vercel Production env vars, Supabase Auth URLs, and Google OAuth redirect URI.
