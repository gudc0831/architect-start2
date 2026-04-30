# Post-Preview Execution Record

- Updated: 2026-04-24
- Status: archived execution record
- Superseded by: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)
- Parent index: [../PLAN.md](../PLAN.md)
- Base implementation plan: [2026-04-07-multi-user-transition-plan.md](2026-04-07-multi-user-transition-plan.md)
- Locked auth contract: [2026-04-10-auth-rbac-contract.md](2026-04-10-auth-rbac-contract.md)
- Deployment guardrails: [2026-04-10-deployment-protection-contract.md](2026-04-10-deployment-protection-contract.md)
- Preview verification matrix: [2026-04-20-preview-verification-expansion-matrix.md](2026-04-20-preview-verification-expansion-matrix.md)
- Latest expanded verification log: [worklogs/2026-04-23-preview-verification-expansion-results.md](worklogs/2026-04-23-preview-verification-expansion-results.md)

## Purpose

This file is no longer the active forward plan. It records what was completed after the original preview auth verification so future workers do not repeat the same setup and verification work.

Use [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md) for the next work order.

## Completed

| Area | Status | Evidence |
| --- | --- | --- |
| Google OAuth preview login | complete | `admin`, `member`, and `no-access` outcomes verified in preview |
| Safe post-login redirect handling | complete | invalid external `next` falls back to an internal route |
| `/api/system/status` protection | complete | anonymous request returns `401 UNAUTHORIZED` |
| Runtime header baseline | complete | CSP, content-type, frame, referrer, permissions, and no-store headers verified in preview |
| Transitional password route restriction | complete | route retained only as a controlled utility behind request-integrity and env gating |
| GitHub security automation baseline | complete in repo | CI, CodeQL, Semgrep, Dependabot, and dependency audit workflow files added |
| Direct dependency patch pass | complete for low-risk direct fixes | Next.js, Prisma, Firebase, and related direct dependencies patched in the previous repo slice |
| GitHub `main` protection setup | complete externally | branch ruleset configured with PR requirement, force-push blocking, and required checks |
| Vercel Preview Authentication restore | complete externally | preview protection restored after no-access browser verification |
| Vercel preview environment separation | complete for preview bundle | Supabase/Postgres envs narrowed to Preview where present |
| Preview data gate | complete | `Project B` created as `preview-rbac-b`; `gudc08311@gmail.com` is manager there |
| Manager positive path | complete | `GET /api/admin/projects/<Project B>/members` returned `200` |
| Manager negative path | complete by read-only guard | `GET /api/admin/projects/<Project A>/members` returned `PROJECT_MANAGER_REQUIRED` |
| Request-integrity invalid origin probe | complete | `POST /api/projects/select` with foreign origin returned `REQUEST_ORIGIN_INVALID` |
| Request-integrity missing origin probe | complete | `POST /api/projects/select` without `Origin` or `Referer` returned `REQUEST_ORIGIN_REQUIRED` |

## Do Not Rework

Do not reopen these decisions or repeat this setup unless a new regression appears:

- Google OAuth remains the cloud login path.
- Phase 1 RBAC remains `admin`, project `manager`, and project `member`.
- Preview uses the existing preview Supabase project and the current preview data shape.
- No-access browser behavior remains covered by the earlier preview pass. After Vercel Authentication was restored, the Vercel protection layer can reuse the Vercel/Google browser session before the app-level account chooser appears.
- The destructive `PATCH /api/project` manager-negative probe is optional because the same manager guard was already proven through the read-only members route.

## Remaining Work Moved Forward

The active remaining items are now tracked in [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md):

- resolve current PR check failures before merge
- finish any minimal preview verification still needed for release sign-off
- design and apply Postgres RLS and Supabase Storage policies in preview
- add assignee-profile linkage
- harden concurrent task/file write paths
- run final release readiness checks
