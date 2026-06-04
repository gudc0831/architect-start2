# RLS And Storage Policy Boundary Design

- Updated: 2026-04-24
- Status: applied to preview on 2026-04-24; local-app Preview file-flow verified, remote protected browser sign-off optional
- Active plan: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)
- Policy SQL: [sql/2026-04-24-preview-rls-storage-policies.sql](sql/2026-04-24-preview-rls-storage-policies.sql)

## Summary

This policy set adds the database and Supabase Storage policy boundary required after the preview app-guard verification. It does not change the locked auth/RBAC contract:

- global `admin` keeps a bypass
- project `manager` can manage project-scoped settings and membership
- project `member` can access project task/file data
- unprovisioned authenticated users receive no project data

The SQL is intended for the preview Supabase project first. Do not apply it to production until preview probes pass.

## Current Access Paths

- Normal server routes still use Prisma and trusted server-side Supabase clients.
- Browser direct Storage upload exists through `/api/files/upload-intents` followed by `supabase.storage.from(bucket).upload(...)` and `/api/files/commit`.
- File download is app-mediated through signed URL or authenticated content routes.
- Object paths are project- and task-scoped: `projects/<projectId>/tasks/<taskId>/<uuid>-<safeName>`.

## Policy Shape

- Helper functions live in `app_private` and use `auth.uid()` plus `profiles` and `project_memberships`.
- RLS is enabled for:
  - `profiles`
  - `projects`
  - `project_memberships`
  - `tasks`
  - `files`
  - `profile_preferences`
  - `work_type_definitions`
  - `foundation_settings`
- Storage policies are scoped to bucket `task-files` and the `projects/<projectId>/tasks/<taskId>/...` path convention.
- Storage insert requires project access plus a real task under that project.
- Storage update/delete is limited to project managers/admins or the object owner, preserving browser cleanup for failed direct uploads without granting broad member delete rights.

## Preview Rollout

Applied on 2026-04-24 after user approval:

1. Confirmed `SUPABASE_STORAGE_BUCKET=task-files`.
2. Ran guarded backups before Prisma migration, SQL policy application, and bucket setup.
3. Applied pending Prisma migrations to preview with `npm run db:migrate:safe`.
4. Applied [sql/2026-04-24-preview-rls-storage-policies.sql](sql/2026-04-24-preview-rls-storage-policies.sql) with `npm run db:apply-sql:safe`.
5. Created the private `task-files` preview bucket with `npm run storage:ensure-bucket:safe`.
6. Ran positive and negative probes:
   - anonymous requests see no table or storage data
   - `gudc0831111@gmail.com` sees no project data
   - `gudc08311@gmail.com` can access Project B and cannot access Project A manager paths
   - admin can access all projects
   - rollback-only Storage insert probe allows Project B member and denies unrelated authenticated user
7. Verified Project B file flow through `http://localhost:3000` using the Preview DB/Storage configuration:
   - generated a Supabase session for `gudc08311@gmail.com`
   - selected Project B and created a temporary task fixture
   - created an upload intent, uploaded directly to the private `task-files` bucket, committed the file row, generated a signed download URL, and verified downloaded content
   - forced a bad commit with a size mismatch, received `FILE_UPLOAD_SIZE_MISMATCH`, removed the orphan object as the member owner, and verified the object was gone
   - removed the committed object and task fixture, then verified `tasks=0`, `files=0`, and `storage_objects=0` for the temporary identifiers

Remaining optional sign-off:

- Exact remote deployed-browser session verification on the Vercel protected Preview URL, only if required. Vercel Preview Authentication blocked automated custom-cookie app API calls against the remote deployment, so the completed file-flow check used the local app server connected to the same Preview DB/Storage.

## Notes

- The service-role key continues to bypass RLS for trusted server maintenance, bootstrap, and backup flows.
- The Prisma migration in the RLS slice adds an index for `files(project_id, deleted_at, purged_at)` so file metadata policies and queries stay index-aware.
- The policy SQL is not a Prisma migration because it depends on Supabase-specific `auth` and `storage` schemas.
