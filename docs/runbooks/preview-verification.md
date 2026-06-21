# Preview Verification Runbook

## Purpose

`codex/multi-user-transition` is the Preview verification branch.

Branch alias:

https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app

## Link Types

### Fast Deployment Smoke

Use `/preview/*` routes only to confirm that the deployment, static assets, and public preview UI load.

Examples:

- `/preview/daily`
- `/preview/board`

These routes use preview/demo data. Do not use them to verify the real database, admin flows, AI review, permissions, or Supabase integration.

### Real Preview Verification

Use real app routes for database-backed and permission-backed verification.

Examples:

- `/admin`
- `/admin/assistant`
- `/board`
- `/daily`

These routes require app login and validate the real Preview environment.

## Root URL Warning

Do not use `/` as the default verification URL.

The root URL changes behavior depending on browser session state:

- no app session: redirects to `/login`
- valid app session: may route to `/board`
- stale cookies or stale cached assets: may show browser-level load errors

Use an explicit route for each verification target.

## Common Failure Pattern

A branch alias can point to a newer direct deployment while the browser still has cached assets from an older deployment. This can make the page appear to fail with messages like:

- `This page couldn't load`
- blank page
- reload loop

This is usually not proof that the server is down.

## Verification Order

1. Confirm Vercel deployment is `Ready`.
2. Confirm branch alias points to the latest direct deployment.
3. Confirm `/preview/daily` returns `200`.
4. For real feature checks, open the exact real app route:
   - `/admin`
   - `/admin/assistant`
   - `/board`
   - `/daily`
5. If the browser shows a load error, retry in this order:
   - hard refresh
   - new tab
   - InPrivate window
   - clear site data for the Preview host

## Canonical URLs

Fast smoke:

https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/preview/daily

Admin:

https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/admin

AI review/admin assistant:

https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/admin/assistant

Database-backed daily:

https://architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app/daily
