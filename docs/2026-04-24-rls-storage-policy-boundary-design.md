# RLS And Storage Policy Boundary Design

- Updated: 2026-04-24
- Status: preview rollout draft, not applied
- Active plan: [2026-04-24-deployment-readiness-plan.md](2026-04-24-deployment-readiness-plan.md)
- Policy SQL: [sql/2026-04-24-preview-rls-storage-policies.sql](sql/2026-04-24-preview-rls-storage-policies.sql)

## Summary

This draft adds the database and Supabase Storage policy boundary required after the preview app-guard verification. It does not change the locked auth/RBAC contract:

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

1. Confirm the preview bucket name is `task-files`; otherwise edit the SQL bucket literal before applying.
2. Run `npm run data:backup` against the preview environment before DB policy changes.
3. Apply [sql/2026-04-24-preview-rls-storage-policies.sql](sql/2026-04-24-preview-rls-storage-policies.sql) to the preview Supabase project only.
4. Run positive and negative probes:
   - anonymous requests see no table or storage data
   - `gudc0831111@gmail.com` sees no project data
   - `gudc08311@gmail.com` can access Project B and cannot access Project A manager paths
   - Project B direct upload intent, Storage upload, commit, signed download, and cleanup behavior work
   - admin can access all projects
5. If any probe fails, roll back the policy SQL before continuing release readiness.

## Notes

- The service-role key continues to bypass RLS for trusted server maintenance, bootstrap, and backup flows.
- The Prisma migration added in this slice only adds an index for `files(project_id, deleted_at, purged_at)` so file metadata policies and queries stay index-aware.
- The policy SQL is not a Prisma migration because it depends on Supabase-specific `auth` and `storage` schemas.
