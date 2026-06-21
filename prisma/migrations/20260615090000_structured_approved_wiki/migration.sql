create table "knowledge_generation_profiles" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "version" integer not null,
  "state" text not null default 'draft',
  "source_bucket_rules" jsonb not null default '{}'::jsonb,
  "toc_template" jsonb not null default '[]'::jsonb,
  "ontology_schema" jsonb not null default '{}'::jsonb,
  "citation_rules" jsonb not null default '[]'::jsonb,
  "section_rules" jsonb not null default '[]'::jsonb,
  "created_by" uuid not null,
  "updated_by" uuid not null,
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null,
  "archived_at" timestamptz(6),
  constraint "knowledge_generation_profiles_created_by_fkey"
    foreign key ("created_by") references "profiles" ("id") on delete restrict on update cascade,
  constraint "knowledge_generation_profiles_updated_by_fkey"
    foreign key ("updated_by") references "profiles" ("id") on delete restrict on update cascade
);

create unique index "knowledge_generation_profiles_name_version_key"
  on "knowledge_generation_profiles" ("name", "version");

create index "knowledge_generation_profiles_state_updated_at_idx"
  on "knowledge_generation_profiles" ("state", "updated_at");

create table "knowledge_generation_runs" (
  "id" uuid primary key default gen_random_uuid(),
  "record_id" uuid not null,
  "profile_id" uuid not null,
  "profile_version" integer not null,
  "source_bundle_digest" text not null,
  "prompt_digest" text not null,
  "legal_verification_status" text not null default 'not_required',
  "legal_verification_digest" text not null default '',
  "project_context_trace_digest" text not null default '',
  "provider" text not null default 'mock',
  "model" text not null default 'mock',
  "structured_draft" jsonb not null default '{}'::jsonb,
  "warnings" jsonb not null default '[]'::jsonb,
  "created_by" uuid not null,
  "created_at" timestamptz(6) not null default now(),
  constraint "knowledge_generation_runs_record_id_fkey"
    foreign key ("record_id") references "assistant_task_records" ("id") on delete cascade on update cascade,
  constraint "knowledge_generation_runs_profile_id_fkey"
    foreign key ("profile_id") references "knowledge_generation_profiles" ("id") on delete restrict on update cascade,
  constraint "knowledge_generation_runs_created_by_fkey"
    foreign key ("created_by") references "profiles" ("id") on delete restrict on update cascade
);

create index "knowledge_generation_runs_record_id_created_at_idx"
  on "knowledge_generation_runs" ("record_id", "created_at");

create index "knowledge_generation_runs_profile_id_created_at_idx"
  on "knowledge_generation_runs" ("profile_id", "created_at");

create table "knowledge_items" (
  "id" uuid primary key default gen_random_uuid(),
  "public_id" text not null,
  "project_id" uuid,
  "state" text not null default 'draft',
  "title" text not null,
  "slug" text not null,
  "scope" text not null,
  "tags" jsonb not null default '[]'::jsonb,
  "ontology" jsonb not null default '{}'::jsonb,
  "created_by" uuid not null,
  "updated_by" uuid not null,
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null,
  constraint "knowledge_items_project_id_fkey"
    foreign key ("project_id") references "projects" ("id") on delete cascade on update cascade,
  constraint "knowledge_items_created_by_fkey"
    foreign key ("created_by") references "profiles" ("id") on delete restrict on update cascade,
  constraint "knowledge_items_updated_by_fkey"
    foreign key ("updated_by") references "profiles" ("id") on delete restrict on update cascade
);

create unique index "knowledge_items_public_id_key"
  on "knowledge_items" ("public_id");

create unique index "knowledge_items_project_id_slug_key"
  on "knowledge_items" ("project_id", "slug");

create index "knowledge_items_state_updated_at_idx"
  on "knowledge_items" ("state", "updated_at");

create index "knowledge_items_project_id_state_updated_at_idx"
  on "knowledge_items" ("project_id", "state", "updated_at");

create table "knowledge_item_versions" (
  "id" uuid primary key default gen_random_uuid(),
  "item_id" uuid not null,
  "version" integer not null,
  "state" text not null default 'draft',
  "title" text not null,
  "summary" text not null,
  "body_markdown" text not null,
  "structured_draft" jsonb not null default '{}'::jsonb,
  "toc" jsonb not null default '[]'::jsonb,
  "section_blocks" jsonb not null default '[]'::jsonb,
  "content_digest" text not null,
  "source_digest" text not null,
  "source_record_id" uuid,
  "source_task_id" uuid,
  "source_project_id" uuid,
  "generation_run_id" uuid,
  "approved_by" uuid,
  "approved_at" timestamptz(6),
  "supersedes_id" uuid,
  "created_at" timestamptz(6) not null default now(),
  constraint "knowledge_item_versions_item_id_fkey"
    foreign key ("item_id") references "knowledge_items" ("id") on delete cascade on update cascade,
  constraint "knowledge_item_versions_source_record_id_fkey"
    foreign key ("source_record_id") references "assistant_task_records" ("id") on delete set null on update cascade,
  constraint "knowledge_item_versions_source_project_id_fkey"
    foreign key ("source_project_id") references "projects" ("id") on delete set null on update cascade,
  constraint "knowledge_item_versions_source_task_fkey"
    foreign key ("source_project_id", "source_task_id") references "tasks" ("project_id", "id") on delete set null on update cascade,
  constraint "knowledge_item_versions_generation_run_id_fkey"
    foreign key ("generation_run_id") references "knowledge_generation_runs" ("id") on delete set null on update cascade,
  constraint "knowledge_item_versions_approved_by_fkey"
    foreign key ("approved_by") references "profiles" ("id") on delete set null on update cascade,
  constraint "knowledge_item_versions_supersedes_id_fkey"
    foreign key ("supersedes_id") references "knowledge_item_versions" ("id") on delete set null on update cascade
);

create unique index "knowledge_item_versions_item_id_version_key"
  on "knowledge_item_versions" ("item_id", "version");

create unique index "knowledge_item_versions_item_id_id_key"
  on "knowledge_item_versions" ("item_id", "id");

create unique index "knowledge_item_versions_source_record_id_key"
  on "knowledge_item_versions" ("source_record_id");

create index "knowledge_item_versions_item_id_state_created_at_idx"
  on "knowledge_item_versions" ("item_id", "state", "created_at");

create index "knowledge_item_versions_source_project_id_state_approved_at_idx"
  on "knowledge_item_versions" ("source_project_id", "state", "approved_at");

create index "knowledge_item_versions_generation_run_id_idx"
  on "knowledge_item_versions" ("generation_run_id");

create table "knowledge_source_references" (
  "id" uuid primary key default gen_random_uuid(),
  "source_ref_id" text not null,
  "item_id" uuid not null,
  "version_id" uuid not null,
  "source_kind" text not null,
  "source_id" text not null,
  "title" text not null,
  "locator" text not null default '',
  "excerpt" text not null default '',
  "source_url" text,
  "digest" text not null,
  "authority_rank" integer not null default 0,
  "verified_at" timestamptz(6),
  "stale" boolean not null default false,
  "legal_change_warnings" jsonb not null default '[]'::jsonb,
  "allowed_use" text not null default 'context',
  "created_at" timestamptz(6) not null default now(),
  constraint "knowledge_source_references_item_id_fkey"
    foreign key ("item_id") references "knowledge_items" ("id") on delete cascade on update cascade,
  constraint "knowledge_source_references_item_version_id_fkey"
    foreign key ("item_id", "version_id") references "knowledge_item_versions" ("item_id", "id") on delete cascade on update cascade
);

create index "knowledge_source_references_item_id_source_kind_idx"
  on "knowledge_source_references" ("item_id", "source_kind");

create index "knowledge_source_references_version_id_source_kind_idx"
  on "knowledge_source_references" ("version_id", "source_kind");

create unique index "knowledge_source_references_version_id_source_ref_id_key"
  on "knowledge_source_references" ("version_id", "source_ref_id");

create index "knowledge_source_references_source_kind_source_id_idx"
  on "knowledge_source_references" ("source_kind", "source_id");

alter table "knowledge_items"
  add constraint "knowledge_items_state_check" check ("state" in ('draft', 'active', 'archived'));

alter table "knowledge_items"
  add constraint "knowledge_items_scope_check" check ("scope" in ('admin_only', 'organization', 'project_members', 'project'));

alter table "knowledge_items"
  add constraint "knowledge_items_scope_project_check"
  check (
    ("scope" = 'organization' and "project_id" is null)
    or ("scope" in ('admin_only', 'project_members', 'project') and "project_id" is not null)
  );

alter table "knowledge_item_versions"
  add constraint "knowledge_item_versions_state_check" check ("state" in ('draft', 'approved', 'superseded', 'archived'));

alter table "knowledge_source_references"
  add constraint "knowledge_source_references_source_kind_check"
  check ("source_kind" in ('legal_evidence', 'task_context', 'project_document', 'approved_wiki', 'local_wiki', 'external_evidence'));

alter table "knowledge_source_references"
  add constraint "knowledge_source_references_allowed_use_check"
  check ("allowed_use" in ('legal_basis', 'context', 'comparison', 'citation', 'do_not_publish'));

alter table "knowledge_generation_profiles"
  add constraint "knowledge_generation_profiles_state_check" check ("state" in ('draft', 'active', 'archived'));

create unique index "knowledge_generation_profiles_one_active"
  on "knowledge_generation_profiles" ("name")
  where "state" = 'active';

create index "knowledge_item_versions_search_idx"
  on "knowledge_item_versions"
  using gin (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("body_markdown", '')));

create unique index "knowledge_items_organization_slug_unique"
  on "knowledge_items" ("slug")
  where "scope" = 'organization';
