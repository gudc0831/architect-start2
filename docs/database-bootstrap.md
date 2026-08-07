# Empty database bootstrap

`prisma/migrations` starts after the original core tables existed. A newly provisioned database must therefore use the checked-in baseline manifest instead of running `prisma migrate deploy` directly.

## Validation

Run this without a database connection:

```powershell
npm run db:bootstrap:validate
```

The validator proves that:

- `preview-baseline.sql` contains the final state represented by every migration listed in `prisma/bootstrap-manifest.json`.
- the resolve list exactly covers all migrations before `firstDeployMigration`;
- all later migrations remain deployable in their original order;
- the cloud backup public-table manifest matches every Prisma `@@map` table.

## New empty database only

After verifying the exact target is a newly provisioned database with no `public` tables:

```powershell
$env:APP_BACKEND_MODE = "cloud"
$env:DATA_GUARD_BOOTSTRAP = "EMPTY_DATABASE"
npm run db:bootstrap:safe
```

`DATABASE_URL` must already be configured through the approved environment flow. The command refuses a non-empty `public` schema, applies `preview-baseline.sql`, marks only the manifest-listed historical migrations as applied, deploys every later migration, and finishes with `prisma migrate status`.

Do not use this command to repair, reset, or re-baseline an existing database. Existing environments continue to use `npm run data:backup` followed by `npm run db:migrate:safe`.
