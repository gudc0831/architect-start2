create table "assistant_task_records" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "task_id" uuid not null references "tasks"("id") on delete cascade,
  "profile_id" uuid not null references "profiles"("id") on delete cascade,
  "question" text not null,
  "answer" text not null,
  "evidence" jsonb not null default '[]'::jsonb,
  "confidence_score" integer not null default 0,
  "confidence_reason" text not null default '',
  "execution_mode" text not null default 'mock',
  "runtime_mode" text not null default 'mock',
  "draft_summary" jsonb not null default '{}'::jsonb,
  "cleanup_state" text not null default 'draft',
  "candidate_state" text not null default 'candidate',
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null default now()
);

create index "assistant_task_records_project_id_task_id_created_at_idx"
  on "assistant_task_records"("project_id", "task_id", "created_at");

create index "assistant_task_records_profile_id_created_at_idx"
  on "assistant_task_records"("profile_id", "created_at");

create table "assistant_work_summary_drafts" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "task_id" uuid not null references "tasks"("id") on delete cascade,
  "record_id" uuid not null unique references "assistant_task_records"("id") on delete cascade,
  "profile_id" uuid not null references "profiles"("id") on delete cascade,
  "conclusion" text not null,
  "tags" jsonb not null default '[]'::jsonb,
  "scope" text not null default '',
  "follow_up_action" text not null default '',
  "status" text not null default 'draft',
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null default now()
);

create index "assistant_work_summary_drafts_project_id_task_id_created_at_idx"
  on "assistant_work_summary_drafts"("project_id", "task_id", "created_at");

create index "assistant_work_summary_drafts_profile_id_created_at_idx"
  on "assistant_work_summary_drafts"("profile_id", "created_at");

create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::"ProfileRole"
  );
$$;

create or replace function app_private.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project_id is not null and exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = target_project_id
      and pm.profile_id = (select auth.uid())
  );
$$;

create or replace function app_private.is_project_editor(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project_id is not null and exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = target_project_id
      and pm.profile_id = (select auth.uid())
      and pm.role in (
        'editor'::"ProjectMembershipRole",
        'manager'::"ProjectMembershipRole",
        'member'::"ProjectMembershipRole"
      )
  );
$$;

create or replace function app_private.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project_id is not null
    and (app_private.is_admin() or app_private.is_project_member(target_project_id));
$$;

create or replace function app_private.can_write_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project_id is not null
    and (app_private.is_admin() or app_private.is_project_editor(target_project_id));
$$;

create or replace function app_private.can_access_task(target_project_id uuid, target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project_id is not null
    and target_task_id is not null
    and app_private.can_access_project(target_project_id)
    and exists (
      select 1
      from public.tasks t
      where t.id = target_task_id
        and t.project_id = target_project_id
        and t.purged_at is null
    );
$$;

create or replace function app_private.can_write_task(target_project_id uuid, target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project_id is not null
    and target_task_id is not null
    and app_private.can_write_project(target_project_id)
    and exists (
      select 1
      from public.tasks t
      where t.id = target_task_id
        and t.project_id = target_project_id
        and t.purged_at is null
    );
$$;

grant execute on all functions in schema app_private to authenticated;

alter table public.assistant_task_records enable row level security;
alter table public.assistant_work_summary_drafts enable row level security;

drop policy if exists "assistant_task_records_select_task_access" on public.assistant_task_records;
create policy "assistant_task_records_select_task_access"
on public.assistant_task_records
for select
to authenticated
using (app_private.can_access_task(project_id, task_id));

drop policy if exists "assistant_task_records_insert_task_editor" on public.assistant_task_records;
create policy "assistant_task_records_insert_task_editor"
on public.assistant_task_records
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and app_private.can_write_task(project_id, task_id)
);

drop policy if exists "assistant_task_records_update_author_or_admin" on public.assistant_task_records;
create policy "assistant_task_records_update_author_or_admin"
on public.assistant_task_records
for update
to authenticated
using (
  app_private.can_write_task(project_id, task_id)
  and (profile_id = (select auth.uid()) or app_private.is_admin())
)
with check (
  app_private.can_write_task(project_id, task_id)
  and (profile_id = (select auth.uid()) or app_private.is_admin())
);

drop policy if exists "assistant_work_summary_drafts_select_task_access" on public.assistant_work_summary_drafts;
create policy "assistant_work_summary_drafts_select_task_access"
on public.assistant_work_summary_drafts
for select
to authenticated
using (app_private.can_access_task(project_id, task_id));

drop policy if exists "assistant_work_summary_drafts_insert_author" on public.assistant_work_summary_drafts;
create policy "assistant_work_summary_drafts_insert_author"
on public.assistant_work_summary_drafts
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and app_private.can_write_task(project_id, task_id)
);

drop policy if exists "assistant_work_summary_drafts_update_author_or_admin" on public.assistant_work_summary_drafts;
create policy "assistant_work_summary_drafts_update_author_or_admin"
on public.assistant_work_summary_drafts
for update
to authenticated
using (
  app_private.can_write_task(project_id, task_id)
  and (profile_id = (select auth.uid()) or app_private.is_admin())
)
with check (
  app_private.can_write_task(project_id, task_id)
  and (profile_id = (select auth.uid()) or app_private.is_admin())
);
