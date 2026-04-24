# Preview Verification Expansion Matrix

- Updated: 2026-04-24
- Status: completed verification record with optional follow-ups
- Parent plan: [2026-04-20-post-preview-execution-plan.md](2026-04-20-post-preview-execution-plan.md)
- Active forward plan: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)
- Base implementation plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- Latest verified baseline: [worklogs/2026-04-20-preview-auth-verification-and-password-route-restriction.md](worklogs/2026-04-20-preview-auth-verification-and-password-route-restriction.md)
- Latest expanded verification log: [worklogs/2026-04-23-preview-verification-expansion-results.md](worklogs/2026-04-23-preview-verification-expansion-results.md)

## Purpose

This file records the completed preview auth and RBAC verification expansion. It is not the active forward work queue.

Do not recreate the preview data or repeat the same manager/origin checks unless a regression appears.

## Verified Accounts

| Role in verification | Email | Profile id | Notes |
| --- | --- | --- | --- |
| `admin` | `gudc083111@gmail.com` | `facb1932-ec3c-437f-b603-8a5727acf4fc` | earlier preview auth pass |
| `member` | `gudc08311@gmail.com` | `ebeddeb3-fcc7-4aae-a42b-29df536c1401` | `/api/auth/me` returned `role=member` |
| `no-access` | `gudc0831111@gmail.com` | `dff664db-bb79-40ad-805e-80b2d5ff5b69` | rechecked to have `0` project membership rows |

## Verified Preview Data

Active preview host used:

- `architect-start2-git-codex-multi-d1c003-chois-projects-7b2948cf.vercel.app`

| Label | id | name | Membership state |
| --- | --- | --- | --- |
| `Project A` | `856f8cfc-24ce-48f5-ab8f-7516769862d6` | existing preview project | `gudc08311@gmail.com` remains a non-manager member |
| `Project B` | `2150d595-0570-4309-9198-031e90668af4` | `preview-rbac-b` | `gudc08311@gmail.com` is `manager` |

## Completed Matrix

| ID | Status | Result |
| --- | --- | --- |
| `PV-02` | complete | `GET /api/admin/projects/856f8cfc-24ce-48f5-ab8f-7516769862d6/members` returned `PROJECT_MANAGER_REQUIRED` |
| `PV-03` | complete | `GET /api/admin/projects/2150d595-0570-4309-9198-031e90668af4/members` returned `200` with `manager` membership |
| `PV-08` | complete | `POST /api/projects/select` with `Origin: https://evil.example` returned `REQUEST_ORIGIN_INVALID` |
| `PV-09` | complete | `POST /api/projects/select` without `Origin` or `Referer` returned `REQUEST_ORIGIN_REQUIRED` |
| `PV-10` | complete | `/api/auth/me` returned `email=gudc08311@gmail.com` and `role=member` |

The earlier preview auth pass also covered:

- `admin` login reaches workspace
- `member` login reaches workspace
- `no-access` login reaches `/auth/no-access`
- invalid external `next` is contained
- anonymous `/api/system/status` returns `401 UNAUTHORIZED`
- runtime header baseline is present

## Optional Or Deferred Checks

These are not prerequisites to avoid redoing the completed preview setup, but they may be useful for final release sign-off:

| ID | Status | Reason |
| --- | --- | --- |
| `PV-01` | optional | destructive rename-style manager-negative probe; the same manager guard was verified through a read-only route |
| `PV-04` | optional | explicit `/api/project` check after selecting `Project B`; manager access to `Project B` was already proven |
| `PV-05` | deferred | no-access direct API probe needs a reliable approach around Vercel Authentication session reuse |
| `PV-06` | deferred | no-access direct `/api/project` probe has the same Vercel Authentication constraint |
| `PV-07` | complete by earlier pass | browser no-access path was verified before Vercel Authentication was restored |

## Reusable Probe Templates

Use these only if the optional checks are deliberately re-run.

Replace:

- `<COOKIE>` with a local-only authenticated cookie header
- `<PREVIEW_URL>` with the active preview host
- `<PROJECT_A_ID>` with `856f8cfc-24ce-48f5-ab8f-7516769862d6`
- `<PROJECT_B_ID>` with `2150d595-0570-4309-9198-031e90668af4`

Invalid origin:

```powershell
curl.exe -i -X POST "https://<PREVIEW_URL>/api/projects/select" `
  -H "Content-Type: application/json" `
  -H "Origin: https://evil.example" `
  -H "Cookie: <COOKIE>" `
  --data "{\"projectId\":\"<PROJECT_A_ID>\"}"
```

Missing origin and referer:

```powershell
curl.exe -i -X POST "https://<PREVIEW_URL>/api/projects/select" `
  -H "Content-Type: application/json" `
  -H "Cookie: <COOKIE>" `
  --data "{\"projectId\":\"<PROJECT_A_ID>\"}"
```

## Do Not Recreate

- Do not create another `preview-rbac-b` project.
- Do not add another manager row for `gudc08311@gmail.com` on `Project B`.
- Do not add `gudc0831111@gmail.com` to any project unless a new test explicitly requires changing the no-access baseline.
