DROP INDEX IF EXISTS "files_file_group_id_version_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "files_file_group_id_version_key"
  ON "files"("file_group_id", "version");
