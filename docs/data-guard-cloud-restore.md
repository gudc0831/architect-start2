# Data Guard Cloud Backup and Restore Boundary

## Cloud backup coverage

`npm run data:backup` creates a local data-guard snapshot and, when cloud mode is configured, a cloud JSON backup under the cloud data-guard backup root. Cloud backup is best-effort per table: if one table fails, the remaining tables are still attempted and the resulting `backup.json` records:

- `tableCounts`: row counts for tables that were captured.
- `tableErrors`: per-table errors keyed as `schema.table`.
- `backupCoverage`: expected, succeeded, and failed table identifiers.

The cloud backup currently covers the core public tables, governance and assistant tables, file-analysis chunks, and Supabase Storage catalog metadata (`storage.buckets`, `storage.objects`).

## Cloud restore limitation

Cloud backups are JSON coverage snapshots for inspection and emergency manual recovery planning. Automated cloud restore is not implemented. `npm run data:restore` restores local data-guard snapshots only and rejects cloud backup ids.

Supabase Storage deletes have a stricter boundary: the JSON backup can retain bucket/object path metadata from `storage.objects`, but it cannot reconstruct deleted object bytes. Before a Supabase Storage object delete, the storage provider writes a best-effort data-guard audit event with the bucket, object path, and available metadata so operators can identify what was deleted. That audit trail is metadata only; it is not object-body recovery.
