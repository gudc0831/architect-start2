alter table "assistant_task_records"
  add column "review_deleted_at" timestamptz(6),
  add column "review_deleted_by" uuid,
  add column "review_restored_at" timestamptz(6),
  add column "review_restored_by" uuid;

create table "project_wiki_items" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null,
  "source_task_id" uuid not null,
  "source_review_record_id" uuid not null,
  "source_work_summary_draft_id" uuid not null,
  "common_candidate_record_id" uuid,
  "title" text not null,
  "summary" text not null,
  "body_markdown" text not null,
  "tags" jsonb not null default '[]'::jsonb,
  "supplemental_note" text not null default '',
  "ai_suitability_state" text not null,
  "ai_suitability_reason" text not null default '',
  "commonization_caution" text not null default '',
  "status" text not null default 'active',
  "created_by" uuid not null,
  "disabled_by" uuid,
  "disabled_at" timestamptz(6),
  "restored_by" uuid,
  "restored_at" timestamptz(6),
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null,
  constraint "project_wiki_items_project_id_fkey"
    foreign key ("project_id") references "projects" ("id") on delete cascade on update cascade,
  constraint "project_wiki_items_source_task_fkey"
    foreign key ("project_id", "source_task_id") references "tasks" ("project_id", "id") on delete cascade on update cascade,
  constraint "project_wiki_items_source_review_record_id_fkey"
    foreign key ("source_review_record_id") references "assistant_task_records" ("id") on delete restrict on update cascade,
  constraint "project_wiki_items_source_work_summary_draft_id_fkey"
    foreign key ("source_work_summary_draft_id") references "assistant_work_summary_drafts" ("id") on delete restrict on update cascade,
  constraint "project_wiki_items_common_candidate_record_id_fkey"
    foreign key ("common_candidate_record_id") references "assistant_task_records" ("id") on delete set null on update cascade,
  constraint "project_wiki_items_created_by_fkey"
    foreign key ("created_by") references "profiles" ("id") on delete restrict on update cascade,
  constraint "project_wiki_items_disabled_by_fkey"
    foreign key ("disabled_by") references "profiles" ("id") on delete set null on update cascade,
  constraint "project_wiki_items_restored_by_fkey"
    foreign key ("restored_by") references "profiles" ("id") on delete set null on update cascade,
  constraint "project_wiki_items_status_check"
    check ("status" in ('active', 'disabled')),
  constraint "project_wiki_items_ai_suitability_state_check"
    check ("ai_suitability_state" in ('recommended', 'caution', 'not_recommended'))
);

create unique index "project_wiki_items_source_review_record_id_key"
  on "project_wiki_items" ("source_review_record_id");

create unique index "project_wiki_items_common_candidate_record_id_key"
  on "project_wiki_items" ("common_candidate_record_id");

create index "project_wiki_items_project_id_status_updated_at_idx"
  on "project_wiki_items" ("project_id", "status", "updated_at");

create index "project_wiki_items_source_task_id_created_at_idx"
  on "project_wiki_items" ("source_task_id", "created_at");

create table "project_wiki_action_logs" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null,
  "project_wiki_item_id" uuid not null,
  "action" text not null,
  "actor_profile_id" uuid not null,
  "actor_display" text not null default '',
  "reason" text not null default '',
  "created_at" timestamptz(6) not null default now(),
  constraint "project_wiki_action_logs_project_id_fkey"
    foreign key ("project_id") references "projects" ("id") on delete cascade on update cascade,
  constraint "project_wiki_action_logs_project_wiki_item_id_fkey"
    foreign key ("project_wiki_item_id") references "project_wiki_items" ("id") on delete cascade on update cascade,
  constraint "project_wiki_action_logs_actor_profile_id_fkey"
    foreign key ("actor_profile_id") references "profiles" ("id") on delete restrict on update cascade
);

create index "project_wiki_action_logs_project_id_project_wiki_item_id_created_at_idx"
  on "project_wiki_action_logs" ("project_id", "project_wiki_item_id", "created_at");

create index "project_wiki_action_logs_actor_profile_id_created_at_idx"
  on "project_wiki_action_logs" ("actor_profile_id", "created_at");

alter table public.project_wiki_items enable row level security;
alter table public.project_wiki_action_logs enable row level security;

drop policy if exists "project_wiki_items_select_project_access" on public.project_wiki_items;
create policy "project_wiki_items_select_project_access"
on public.project_wiki_items
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "project_wiki_items_insert_project_editor" on public.project_wiki_items;
create policy "project_wiki_items_insert_project_editor"
on public.project_wiki_items
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and app_private.can_write_task(project_id, source_task_id)
);

drop policy if exists "project_wiki_items_update_project_editor" on public.project_wiki_items;
create policy "project_wiki_items_update_project_editor"
on public.project_wiki_items
for update
to authenticated
using (app_private.can_write_project(project_id))
with check (app_private.can_write_project(project_id));

drop policy if exists "project_wiki_action_logs_select_project_access" on public.project_wiki_action_logs;
create policy "project_wiki_action_logs_select_project_access"
on public.project_wiki_action_logs
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "project_wiki_action_logs_insert_project_editor" on public.project_wiki_action_logs;
create policy "project_wiki_action_logs_insert_project_editor"
on public.project_wiki_action_logs
for insert
to authenticated
with check (
  actor_profile_id = (select auth.uid())
  and app_private.can_write_project(project_id)
);
