# Architect Start2

Architect Start2 now runs with a guarded data workflow. Local JSON state, local uploads, and cloud Prisma tasks all pass through the same data-guard policy.

## Operating modes

- `APP_BACKEND_MODE=local`
  - Default for local development.
  - Tasks/files/preferences/project metadata stay in local files under `LOCAL_DATA_ROOT`.
  - Upload binaries stay under `LOCAL_UPLOAD_ROOT`.
  - Auth stays in stub mode with the local placeholder user.
- `APP_BACKEND_MODE=firestore`
  - Optional development mode for shared metadata QA.
  - Task/file metadata uses Firestore.
  - Project metadata, preferences, and uploaded binaries still stay local.
  - Auth still stays in stub mode.
- `APP_BACKEND_MODE=cloud`
  - Deployment mode.
  - Auth uses Supabase Auth.
  - Data uses Postgres through Prisma.
  - Files use Supabase Storage.

## Data guard commands

- `npm run data:doctor`
  - Shows local write protection state, latest snapshots, active lock token, and cloud backup status.
- `npm run data:backup`
  - Creates a local snapshot and, when cloud mode is configured, exports core Postgres tables.
- `npm run data:restore -- --snapshot=<id>`
  - Restores tracked local JSON stores from a saved snapshot.

`DATA_GUARD_MODE=strict` is the default. When a path or data fingerprint changes, the app blocks writes and exposes a one-time `DATA_GUARD_CONFIRM` token through `data:doctor` and `/api/system/status`.

## Recommended workflow

### Local development

1. Copy `.env.example` to `.env.local`.
2. Keep `APP_BACKEND_MODE=local`.
3. Leave Supabase/Firebase variables empty unless you are testing a specific backend mode.
4. Install dependencies.
5. Run `npm run data:doctor` once to confirm the current paths.
6. Start the dev server.

```bash
npm install
npm run data:doctor
npm run dev
```

### Optional Firestore QA mode

1. Set `APP_BACKEND_MODE=firestore`.
2. Fill every `NEXT_PUBLIC_FIREBASE_*` variable.
3. Restart the dev server.

In this mode, only task/file metadata moves to Firestore. Upload binaries still stay local.

### Cloud deployment mode

1. Set `APP_BACKEND_MODE=cloud`.
2. Fill:
   - `DATABASE_URL`
   - `DIRECT_URL` if your platform needs it
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`
3. Run the guarded setup flow.
4. Bootstrap the admin user.

```bash
npm run db:generate
npm run data:backup
npm run db:migrate:safe
npm run db:seed:safe
npm run bootstrap:admin
```

Notes:
- `npm run db:push` is intentionally blocked.
- `npm run db:migrate` and `npm run db:seed` now route through the guarded wrappers.
- Non-empty cloud databases require a visible confirmation token before migrate/seed/import can continue.

## Legacy import

`npm run import:legacy:safe` is the only supported entrypoint.
It defaults to a dry run and does not mutate the database until `--apply` is present.

Examples:

```bash
npm run import:legacy:safe -- --source=local
npm run import:legacy:safe -- --source=local --apply
npm run import:legacy:safe -- --source=firestore --apply --allow-non-empty
```

Rules:
- Run it only when you intentionally want to migrate legacy local/Firestore data into the cloud backend.
- Set `APP_BACKEND_MODE=cloud` before running it.
- Expect the script to use the active cloud storage provider during import.
- On a non-empty database, review `npm run data:doctor` first and use the current `DATA_GUARD_CONFIRM` token.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

On Windows, `npm run build` can fail if another `next dev` process is holding the default `.next` directory.
Use a temporary dist directory when needed during verification.
