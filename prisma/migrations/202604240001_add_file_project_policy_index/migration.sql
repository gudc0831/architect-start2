CREATE INDEX IF NOT EXISTS "files_project_id_deleted_at_purged_at_idx"
  ON "files"("project_id", "deleted_at", "purged_at");
