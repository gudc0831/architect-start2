# Supabase Migration Guide

Use this guide only when you intentionally cut over from local/Firestore development data to the cloud backend.
It is no longer part of the default setup flow.

## Target architecture

- Auth: Supabase Auth
- Database: Postgres via Prisma
- File storage: Supabase Storage
- Concurrency: optimistic locking with `tasks.version`
- Security boundary: app guards + Postgres RLS + Storage policies

## Prerequisites

Set these values in `.env.local` or your deployment environment:

```env
APP_BACKEND_MODE=cloud
DATA_GUARD_MODE=strict
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=task-files
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_PASSWORD=
BOOTSTRAP_ADMIN_DISPLAY_NAME=Admin
```

Notes:

- This repo currently reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` in code.
- Supabase also documents the newer publishable key naming, but do not switch env names in operations until the code is updated to support it.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-only.

## Auth redirect and callback prerequisites

Before cloud cutover:

- set the Supabase `SITE_URL` to the exact production app URL
- add redirect allow-list entries for:
  - `http://localhost:3000/**`
  - `https://*-<team-or-account-slug>.vercel.app/**`
  - the exact production callback URL path
- configure the Google provider callback in both Google Cloud and Supabase
- keep preview and production domains explicit; do not reuse production redirect URLs as a wildcard

## Security boundary rules

- Enable RLS for browser-reachable data paths.
- Add index-aware membership checks for project-scoped policies.
- Keep private buckets private and enforce `storage.objects` policies for upload and read paths.
- Do not use the service-role key for standard user-scoped board traffic.
- If direct browser upload or download is introduced, ship the matching policy changes in the same rollout.

## Standard cloud setup

```bash
npm install
npm run db:generate
npm run data:backup
npm run db:migrate:safe
npm run db:seed:safe
npm run bootstrap:admin
npm run typecheck
npm run lint
npm run build
```

Notes:
- `npm run db:push` is blocked by policy.
- If the target database is non-empty, inspect `npm run data:doctor` and use the active `DATA_GUARD_CONFIRM` token before continuing.
- Configure redirect URLs and the Google provider before relying on cloud login.
- Run policy SQL changes as part of a reviewed migration path, not as ad hoc dashboard-only edits without a tracked record.

## Optional legacy import

Run this only if you explicitly want to move old local/Firestore data into the cloud backend.
The current project policy is to start fresh unless a manual recovery import is required.

Dry run first:

```bash
npm run import:legacy:safe -- --source=local
# or
npm run import:legacy:safe -- --source=firestore
```

Apply only after review:

```bash
npm run import:legacy:safe -- --source=local --apply
# or, for a non-empty target database
npm run import:legacy:safe -- --source=firestore --apply --allow-non-empty
```

Rules:
- Keep `APP_BACKEND_MODE=cloud` while importing.
- Review imported task/file counts after the run.
- Treat `--skip-missing-files` as a recovery-only option.
- On non-empty databases, use the current `DATA_GUARD_CONFIRM` token from `npm run data:doctor`.

## Cutover checklist

- `APP_BACKEND_MODE=cloud` is set.
- Cloud env variables are complete.
- `/login` and the OAuth callback work with real Supabase credentials.
- Redirect allow-list entries are correct for localhost, preview, and the exact production site URL.
- Protected pages redirect or return `401` correctly when logged out.
- Task, file, project, and preference writes land in Postgres.
- File uploads use Supabase Storage and download URLs resolve.
- Unrelated authenticated users cannot access project data through direct API, REST, or storage object paths.
- `SUPABASE_SERVICE_ROLE_KEY` is not exposed to browser code or required for normal user-scoped workspace flows.
