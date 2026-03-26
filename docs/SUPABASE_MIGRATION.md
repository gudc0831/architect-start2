# Supabase Migration Guide

Use this guide only when you intentionally cut over from local/Firestore development data to the cloud backend.
It is no longer part of the default setup flow.

## Target architecture

- Auth: Supabase Auth
- Database: Postgres via Prisma
- File storage: Supabase Storage
- Concurrency: optimistic locking with `tasks.version`

## Prerequisites

Set these values in `.env.local` or your deployment environment:

```env
APP_BACKEND_MODE=cloud
DATA_GUARD_MODE=strict
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=task-files
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_PASSWORD=
BOOTSTRAP_ADMIN_DISPLAY_NAME=Admin
```

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
- `/login` works with real Supabase credentials.
- Protected pages redirect or return `401` correctly when logged out.
- Task, file, project, and preference writes land in Postgres.
- File uploads use Supabase Storage and download URLs resolve.
