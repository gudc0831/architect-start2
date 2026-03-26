---
name: protect-data
description: Prevent accidental data loss during local development and cloud migration work. Use when tasks touch local repositories, storage layers, Prisma, import/bootstrap scripts, or environment values that affect data paths or database targets.
---

# Protect Data

Use this skill whenever a task changes any of the following:
- `src/repositories/local/*`
- `src/repositories/memory/*`
- `src/storage/*`
- `prisma/*`
- `scripts/import-legacy*`
- `scripts/bootstrap-admin.ts`
- `.env*` values that affect `APP_BACKEND_MODE`, `LOCAL_DATA_ROOT`, `LOCAL_UPLOAD_ROOT`, or `DATABASE_URL`

## Goal

Prevent accidental data loss during local development and cloud migration work.

## Required checks

1. Read `.env.local` or the active env source first.
2. Confirm `APP_BACKEND_MODE`, `LOCAL_DATA_ROOT`, `LOCAL_UPLOAD_ROOT`, and `DATABASE_URL` before changing code.
3. Run `npm run data:doctor` before any risky change or command.
4. If local JSON stores or cloud DB already contain data, create a backup with `npm run data:backup` before continuing.
5. Never recommend `npm run db:push`.
6. Use `npm run db:migrate:safe`, `npm run db:seed:safe`, and `npm run import:legacy:safe` for Prisma/import work.

## Implementation rules

- Local reads must stay read-only. Do not write normalized fallback data during reads.
- Every local write path should go through the shared guard layer in `src/lib/data-guard/local.ts`.
- Local permanent file deletion should quarantine the file instead of removing it immediately.
- Cloud scripts must create JSON backups before risky writes.
- Non-empty cloud DB writes require explicit confirmation through `DATA_GUARD_CONFIRM`.

## Close-out

Report:
- which data paths or DB target were touched
- which guard command was used for verification
- whether backup/snapshot creation was verified
