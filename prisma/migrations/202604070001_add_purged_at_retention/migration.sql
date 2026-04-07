alter table "tasks"
  add column "purged_at" timestamptz(6);

alter table "files"
  add column "purged_at" timestamptz(6);

drop index if exists "tasks_project_id_deleted_at_idx";
create index "tasks_project_id_deleted_at_purged_at_idx"
  on "tasks" ("project_id", "deleted_at", "purged_at");

drop index if exists "files_task_id_deleted_at_idx";
create index "files_task_id_deleted_at_purged_at_idx"
  on "files" ("task_id", "deleted_at", "purged_at");
