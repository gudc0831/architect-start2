# Architect Start Plan Index

- Updated: 2026-04-24
- Purpose: keep this file as the high-level operating plan only.
- Rule: implementation details belong in linked plan documents, not in this file.

## Read Order

1. [docs/2026-04-10-auth-rbac-contract.md](docs/2026-04-10-auth-rbac-contract.md)
2. [docs/2026-04-07-multi-user-transition-plan.md](docs/2026-04-07-multi-user-transition-plan.md)
3. [docs/2026-04-24-deployment-readiness-plan.md](docs/2026-04-24-deployment-readiness-plan.md)
4. [docs/2026-04-20-post-preview-execution-plan.md](docs/2026-04-20-post-preview-execution-plan.md)
5. [docs/2026-04-10-deployment-protection-contract.md](docs/2026-04-10-deployment-protection-contract.md)
6. [docs/2026-04-10-security-deployment-review.md](docs/2026-04-10-security-deployment-review.md)
7. [docs/2026-04-07-predeploy-implementation-plan.md](docs/2026-04-07-predeploy-implementation-plan.md)
8. [docs/SUPABASE_MIGRATION.md](docs/SUPABASE_MIGRATION.md)
9. [docs/PLAN_MEETING_LOG.md](docs/PLAN_MEETING_LOG.md)

## Current Direction

- Local development stays on `APP_BACKEND_MODE=local`.
- Real multi-user auth and authorization are implemented and verified only in `cloud` mode.
- Phase 1 multi-user is locked to:
  - `Supabase Google OAuth`
  - pre-provisioned access
  - project-scoped RBAC
  - global admin bypass
- Long-term cloud security boundary is:
  - app-level guards
  - Supabase Postgres RLS
  - Supabase Storage policies
- Current release blockers are tracked in:
  - [docs/2026-04-10-security-deployment-review.md](docs/2026-04-10-security-deployment-review.md)
- Current active deployment-readiness work is tracked in:
  - [docs/2026-04-24-deployment-readiness-plan.md](docs/2026-04-24-deployment-readiness-plan.md)
- `SUPABASE_SERVICE_ROLE_KEY` is reserved for bootstrap, admin provisioning, maintenance, and other trusted server-only flows.
- Private-repo release safety is enforced with branch protection, required checks, and environment separation.
- Branch flow: code changes happen locally first, then reach Preview only after push and Vercel deployment from the working/PR branch; Production should deploy from the protected production branch, currently expected to be `main` unless a documented release branch replaces it.
- Deployment and DB changes remain separate operational steps.
- Completed preview setup and verification should not be repeated unless a regression appears.

## Big Flow

1. Environment boundary
   - Local mode is for development assistance only.
   - Preview and production use separate Supabase projects.
2. Auth and RBAC
   - The detailed contract lives in [docs/2026-04-10-auth-rbac-contract.md](docs/2026-04-10-auth-rbac-contract.md).
   - The execution plan lives in [docs/2026-04-07-multi-user-transition-plan.md](docs/2026-04-07-multi-user-transition-plan.md).
3. Data and storage security boundary
   - Browser-facing data and storage access must eventually be backed by RLS and storage policies, not only route guards.
   - Service-role access is not the default path for user-scoped reads or writes.
4. Deployment and release protection
   - The deployment contract lives in [docs/2026-04-10-deployment-protection-contract.md](docs/2026-04-10-deployment-protection-contract.md).
   - Private repo baseline does not rely on GitHub environment required reviewers.
   - Current security findings live in [docs/2026-04-10-security-deployment-review.md](docs/2026-04-10-security-deployment-review.md).
5. Deployment and data safety
   - Deployment does not auto-run DB migrations, seed, or admin bootstrap.
   - Run backups before cloud data changes.
6. Verification path
   - Multi-user correctness is verified in `preview + test Supabase`.
   - Local mode is not accepted as final proof for multi-user auth or RBAC behavior.

## Where To Look In Code

- Auth entry points
  - `src/app/api/auth/*`
  - `src/app/auth/*`
  - `src/lib/auth/*`
  - `src/lib/supabase/*`
  - `middleware.ts`
  - `src/app/login/page.tsx`
  - `src/components/auth/login-form.tsx`
- Project selection and access control
  - `src/use-cases/admin/admin-service.ts`
  - `src/use-cases/task-project-context.ts`
  - `src/use-cases/project-scope-guard.ts`
  - `src/app/api/projects/*`
  - `src/app/api/project/route.ts`
- Project-scoped admin and membership work
  - `src/app/api/admin/**`
  - `src/repositories/admin/*`
- Task, file, and preference behavior affected by project/user scope
  - `src/use-cases/task-service.ts`
  - `src/use-cases/file-service.ts`
  - `src/use-cases/trash-service.ts`
  - `src/use-cases/preference-service.ts`
- Schema and bootstrap
  - `prisma/schema.prisma`
  - `prisma/migrations/*`
  - `scripts/bootstrap-admin.ts`

## Operational Rules

- Before any cloud DB change:
  - `npm run data:backup`
- Manual cloud DB commands only:
  - `npm run db:migrate:safe`
  - `npm run db:seed:safe`
  - `npm run bootstrap:admin`
- Keep preview and production Supabase projects separate.
- Keep preview and production Vercel environment variables separate.
- Do not use `SUPABASE_SERVICE_ROLE_KEY` in browser code or normal user-scoped request paths.

## Detailed Plan Documents

- Auth and RBAC contract:
  - [docs/2026-04-10-auth-rbac-contract.md](docs/2026-04-10-auth-rbac-contract.md)
- Multi-user implementation plan:
  - [docs/2026-04-07-multi-user-transition-plan.md](docs/2026-04-07-multi-user-transition-plan.md)
- Post-preview execution plan:
  - [docs/2026-04-20-post-preview-execution-plan.md](docs/2026-04-20-post-preview-execution-plan.md)
- Current deployment readiness plan:
  - [docs/2026-04-24-deployment-readiness-plan.md](docs/2026-04-24-deployment-readiness-plan.md)
- Deployment and release protection contract:
  - [docs/2026-04-10-deployment-protection-contract.md](docs/2026-04-10-deployment-protection-contract.md)
- Security deployment review:
  - [docs/2026-04-10-security-deployment-review.md](docs/2026-04-10-security-deployment-review.md)
- Predeploy implementation plan:
  - [docs/2026-04-07-predeploy-implementation-plan.md](docs/2026-04-07-predeploy-implementation-plan.md)
- Supabase migration and setup:
  - [docs/SUPABASE_MIGRATION.md](docs/SUPABASE_MIGRATION.md)

## Notes

- Do not expand this file back into a long implementation checklist.
- When auth or RBAC decisions change, update the contract document first.
- When sequence, ownership, or verification changes, update the active execution plan first, then update the multi-user transition plan if the phase contract itself changed.
- When release rules or environment protection changes, update the deployment protection contract.
- When new blocking security findings appear, update the security deployment review and then reflect the fix order back into the active plans.
