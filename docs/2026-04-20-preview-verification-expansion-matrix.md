# Preview Verification Expansion Matrix

- Updated: 2026-04-20
- Parent plan: [2026-04-20-post-preview-execution-plan.md](2026-04-20-post-preview-execution-plan.md)
- Base implementation plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- Latest verified baseline: [worklogs/2026-04-20-preview-auth-verification-and-password-route-restriction.md](worklogs/2026-04-20-preview-auth-verification-and-password-route-restriction.md)

## Purpose

This document prepares the remaining preview verification work before the next user gate.

Use this file for:

- the smallest preview test-data shape that closes the remaining auth and RBAC gaps
- the exact accounts to use
- the exact routes to probe
- the expected status and error codes
- the exact mutation-origin probes that still need to be run

This document does not reopen auth or RBAC policy.

## Current Verified Accounts

The current preview verification already used these Google accounts:

- `admin`: `gudc083111@gmail.com`
- `member`: `gudc08311@gmail.com`
- `no-access`: `gudc0831111@gmail.com`

## Current Verified Baseline

Already proven in preview:

- `admin` login succeeds and reaches the workspace
- `member` login succeeds and reaches the workspace
- `no-access` login succeeds but lands on `/auth/no-access`
- invalid external `next` does not leave the site
- anonymous `/api/system/status` returns `401 UNAUTHORIZED`
- runtime header baseline is present

## Minimum Preview Data Additions

The smallest safe preview-only data change is:

1. Keep the current preview project as `Project A`.
2. Keep `gudc08311@gmail.com` as `member` on `Project A`.
3. Create one additional preview-only project as `Project B`.
4. Add `gudc08311@gmail.com` to `Project B` as `manager`.
5. Keep `gudc0831111@gmail.com` with no membership on either project.
6. Record the real `projectId` values for `Project A` and `Project B`.

Recommended preview-only project name:

- `preview-rbac-b`

Why this shape is preferred:

- no new Google account is required
- only one new project is required
- only one new membership row is required
- the existing `member` account can prove both:
  - `member` negative path on `Project A`
  - `manager` positive path on `Project B`
- the existing `no-access` account can prove unrelated authenticated denial without adding another non-member account

## Verification Matrix

| ID | Actor | Project | Path or Route | Method | Expected Result |
| --- | --- | --- | --- | --- | --- |
| PV-01 | `member` | `Project A` | `/api/project` rename attempt with `projectId=<A>` | `PATCH` | `403 PROJECT_MANAGER_REQUIRED` |
| PV-02 | `member` | `Project A` | `/api/admin/projects/<A>/members` | `GET` | `403 PROJECT_MANAGER_REQUIRED` |
| PV-03 | `member` | `Project B` | `/api/admin/projects/<B>/members` | `GET` | `200` with membership list |
| PV-04 | `member` | `Project B` | `/api/project` for `projectId=<B>` | `GET` | `200` with `currentProjectId=<B>` after selection |
| PV-05 | `no-access` | none | `/api/projects/select` with `projectId=<A>` | `POST` | `404 PROJECT_NOT_FOUND` |
| PV-06 | `no-access` | none | `/api/project` | `GET` | `403 PROJECT_ACCESS_DENIED` |
| PV-07 | `no-access` | none | `/board` | browser | `/auth/no-access` screen |
| PV-08 | authenticated user with valid preview cookies | any | `/api/projects/select` with foreign `Origin` | `POST` | `403 REQUEST_ORIGIN_INVALID` |
| PV-09 | authenticated user with valid preview cookies | any | `/api/projects/select` with no `Origin` and no `Referer` | `POST` | `403 REQUEST_ORIGIN_REQUIRED` |
| PV-10 | `member` or `manager` | any allowed project | `/api/auth/me` | `GET` | `200` with correct role and email |

## Preferred Route Targets

Use these routes for the remaining checks because they are small and unambiguous:

- manager-read path:
  - `GET /api/admin/projects/<projectId>/members`
- manager-write negative path:
  - `PATCH /api/project`
- unrelated project selection negative path:
  - `POST /api/projects/select`
- missing or invalid origin probes:
  - `POST /api/projects/select`

Reason:

- they exercise the shared guard model directly
- they return stable error codes
- they avoid larger task or file mutations when a smaller route proves the same boundary

## Exact Probe Templates

Replace:

- `<PREVIEW_URL>` with the active preview host
- `<PROJECT_A_ID>` with the existing `Project A` id
- `<PROJECT_B_ID>` with the new preview-only project id
- `<COOKIE>` with the copied authenticated preview cookie header from the currently logged-in browser

### 1. Member negative manager check on Project A

```bash
curl.exe -i -X PATCH "https://<PREVIEW_URL>/api/project" ^
  -H "Content-Type: application/json" ^
  -H "Origin: https://<PREVIEW_URL>" ^
  -H "Cookie: <COOKIE>" ^
  --data "{\"projectId\":\"<PROJECT_A_ID>\",\"name\":\"preview-negative-check\"}"
```

Expected:

- `403`
- response error code `PROJECT_MANAGER_REQUIRED`

### 2. No-access project selection denial

```bash
curl.exe -i -X POST "https://<PREVIEW_URL>/api/projects/select" ^
  -H "Content-Type: application/json" ^
  -H "Origin: https://<PREVIEW_URL>" ^
  -H "Cookie: <COOKIE>" ^
  --data "{\"projectId\":\"<PROJECT_A_ID>\"}"
```

Expected:

- `404`
- response error code `PROJECT_NOT_FOUND`

### 3. Invalid origin mutation probe

```bash
curl.exe -i -X POST "https://<PREVIEW_URL>/api/projects/select" ^
  -H "Content-Type: application/json" ^
  -H "Origin: https://evil.example" ^
  -H "Cookie: <COOKIE>" ^
  --data "{\"projectId\":\"<PROJECT_A_ID>\"}"
```

Expected:

- `403`
- response error code `REQUEST_ORIGIN_INVALID`

### 4. Missing origin and referer mutation probe

```bash
curl.exe -i -X POST "https://<PREVIEW_URL>/api/projects/select" ^
  -H "Content-Type: application/json" ^
  -H "Cookie: <COOKIE>" ^
  --data "{\"projectId\":\"<PROJECT_A_ID>\"}"
```

Expected:

- `403`
- response error code `REQUEST_ORIGIN_REQUIRED`

## Browser Checks To Keep

These still need real browser confirmation after the preview data gate:

1. `member` signs in and reaches `Project A`.
2. `member` manually switches to `Project B`.
3. `member` on `Project B` can open at least one manager-only screen or request without denial.
4. `no-access` still lands on `/auth/no-access`.
5. project switching does not leak unrelated projects.

## Production Callback Readiness Check

This item remains preparation-only for now:

1. confirm the exact production app URL
2. confirm the production Supabase project URL configuration
3. confirm Google OAuth authorized redirect URIs contain:
   - the Supabase Google callback URL
   - the exact production app callback path used by the app
4. keep this separate from preview data mutation work

## User Gate Required Next

Before these checks can run, the user must approve:

- creation of `Project B`
- one `manager` membership for `gudc08311@gmail.com` on `Project B`

No additional account should be created unless this minimal shape proves insufficient.
