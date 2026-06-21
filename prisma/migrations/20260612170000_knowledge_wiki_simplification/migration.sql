create table "knowledge_import_rubrics" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "version" integer not null,
  "state" text not null default 'draft',
  "hard_blockers" jsonb not null default '[]'::jsonb,
  "scoring_criteria" jsonb not null default '[]'::jsonb,
  "weights" jsonb not null default '{}'::jsonb,
  "created_by" uuid not null,
  "updated_by" uuid not null,
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null,
  "archived_at" timestamptz(6),
  constraint "knowledge_import_rubrics_created_by_fkey"
    foreign key ("created_by") references "profiles" ("id") on delete restrict on update cascade,
  constraint "knowledge_import_rubrics_updated_by_fkey"
    foreign key ("updated_by") references "profiles" ("id") on delete restrict on update cascade,
  constraint "knowledge_import_rubrics_state_check"
    check ("state" in ('draft', 'active', 'archived'))
);

create unique index "knowledge_import_rubrics_name_version_key"
  on "knowledge_import_rubrics" ("name", "version");

create index "knowledge_import_rubrics_state_updated_at_idx"
  on "knowledge_import_rubrics" ("state", "updated_at");

create unique index "knowledge_import_rubrics_one_active"
  on "knowledge_import_rubrics" ("state")
  where "state" = 'active';

create table "knowledge_discovery_requests" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null,
  "task_id" uuid not null,
  "scan_id" uuid not null,
  "state" text not null default 'new',
  "recommendation_score" integer not null default 0,
  "recommendation_reason" text not null default '',
  "evidence_summary" jsonb not null default '{}'::jsonb,
  "promoted_candidate_id" uuid,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz(6),
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null,
  constraint "knowledge_discovery_requests_project_id_fkey"
    foreign key ("project_id") references "projects" ("id") on delete cascade on update cascade,
  constraint "knowledge_discovery_requests_project_task_fkey"
    foreign key ("project_id", "task_id") references "tasks" ("project_id", "id") on delete cascade on update cascade,
  constraint "knowledge_discovery_requests_reviewed_by_fkey"
    foreign key ("reviewed_by") references "profiles" ("id") on delete set null on update cascade,
  constraint "knowledge_discovery_requests_promoted_candidate_id_fkey"
    foreign key ("promoted_candidate_id") references "assistant_task_records" ("id") on delete set null on update cascade,
  constraint "knowledge_discovery_requests_state_check"
    check ("state" in ('new', 'reviewed', 'promoted', 'dismissed', 'stale'))
);

create unique index "knowledge_discovery_requests_scan_id_task_id_key"
  on "knowledge_discovery_requests" ("scan_id", "task_id");

create index "knowledge_discovery_requests_project_id_state_created_at_idx"
  on "knowledge_discovery_requests" ("project_id", "state", "created_at");

create index "knowledge_discovery_requests_task_id_created_at_idx"
  on "knowledge_discovery_requests" ("task_id", "created_at");

create table "knowledge_import_previews" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null,
  "default_task_id" uuid,
  "rubric_id" uuid not null,
  "rubric_version" integer not null,
  "state" text not null default 'draft',
  "workspace_fingerprint" text not null,
  "included_items" jsonb not null default '[]'::jsonb,
  "excluded_items" jsonb not null default '[]'::jsonb,
  "created_by" uuid not null,
  "confirmed_by" uuid,
  "created_at" timestamptz(6) not null default now(),
  "confirmed_at" timestamptz(6),
  constraint "knowledge_import_previews_project_id_fkey"
    foreign key ("project_id") references "projects" ("id") on delete cascade on update cascade,
  constraint "knowledge_import_previews_default_task_fkey"
    foreign key ("project_id", "default_task_id") references "tasks" ("project_id", "id") on delete no action on update cascade,
  constraint "knowledge_import_previews_rubric_id_fkey"
    foreign key ("rubric_id") references "knowledge_import_rubrics" ("id") on delete restrict on update cascade,
  constraint "knowledge_import_previews_created_by_fkey"
    foreign key ("created_by") references "profiles" ("id") on delete restrict on update cascade,
  constraint "knowledge_import_previews_confirmed_by_fkey"
    foreign key ("confirmed_by") references "profiles" ("id") on delete set null on update cascade,
  constraint "knowledge_import_previews_state_check"
    check ("state" in ('draft', 'ready', 'confirmed', 'imported', 'expired'))
);

create index "knowledge_import_previews_project_id_state_created_at_idx"
  on "knowledge_import_previews" ("project_id", "state", "created_at");

create index "knowledge_import_previews_rubric_id_state_created_at_idx"
  on "knowledge_import_previews" ("rubric_id", "state", "created_at");

create index "knowledge_import_previews_created_by_created_at_idx"
  on "knowledge_import_previews" ("created_by", "created_at");
