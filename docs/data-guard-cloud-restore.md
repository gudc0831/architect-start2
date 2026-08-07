# Data Guard Cloud Backup and Restore Boundary

## Cloud backup coverage

`npm run data:backup` creates a local data-guard snapshot and, when cloud mode is configured, a cloud backup under the cloud data-guard backup root. Cloud table reads use one fixed repeatable-read, read-only transaction. That transaction exports a snapshot token, and `pg_dump` uses the same token to create `database.dump`. The backup is fail-closed: a table, dump, or Storage copy failure makes the command exit non-zero and blocks the requested safe mutation. Set `PG_DUMP_PATH` when `pg_dump` is not on `PATH`. The resulting `backup.json` records:

- `databaseSnapshot`: fixed-connection transaction mode, exported snapshot token, timestamps, and commit status.
- `databaseDumpArtifact`: custom-format dump path, source fingerprint, schemas, size, and SHA-256 checksum.
- `tableCounts`: row counts for tables that were captured.
- `tableErrors`: per-table errors keyed as `schema.table`.
- `backupCoverage`: expected, succeeded, and failed table identifiers.
- `storageObjectCopies`: actual Storage object bytes, backup-file path, size, and SHA-256 checksum.
- `storageObjectErrors`: object bodies that could not be copied. Any entry makes the backup fail closed.
- `storageConsistencyBoundary`: explicit proof that the object list came from the database snapshot while downloaded bytes are not transactionally atomic with it.

The cloud backup covers every Prisma-mapped public table, Supabase Storage catalog metadata (`storage.buckets`, `storage.objects`), and the object bytes referenced by that catalog.

## Cloud restore limitation

`npm run data:restore -- --snapshot=<cloud-backup-id>` performs a read-only cloud restore dry run. It verifies the configured database fingerprint, exported snapshot manifest, `database.dump` size/checksum, current table coverage, Storage boundary, and every copied object checksum. It prints the backup-specific confirmation string.

Only a database-only apply path exists. It requires all four explicit controls:

```bash
npm run data:restore -- --snapshot=<cloud-backup-id> --apply --database-only --ack-storage-boundary --confirm=<value-from-dry-run>
```

The command runs `pg_restore` with `--exit-on-error --single-transaction --clean --if-exists --no-owner --no-privileges`; set `PG_RESTORE_PATH` when needed. It does not restore Storage bytes. A full database-plus-Storage apply remains blocked because those systems cannot be restored in one atomic transaction. Perform an isolated restore drill against a disposable compatible Postgres/Supabase target before approving a real restore.
