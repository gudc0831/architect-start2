-- Preview RLS and Storage policy boundary for Architect Start.
-- Apply only to the preview Supabase project after a backup and user approval.
-- If SUPABASE_STORAGE_BUCKET is not task-files, replace the bucket_id literal first.

begin;

create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create or replace function app_private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid();
$$;

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

create or replace function app_private.is_same_project_member(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_profile_id is not null and exists (
    select 1
    from public.project_memberships mine
    join public.project_memberships visible
      on visible.project_id = mine.project_id
    where mine.profile_id = (select auth.uid())
      and visible.profile_id = target_profile_id
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

create or replace function app_private.is_project_manager(target_project_id uuid)
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
      and pm.role = 'manager'::"ProjectMembershipRole"
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

create or replace function app_private.can_manage_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project_id is not null
    and (app_private.is_admin() or app_private.is_project_manager(target_project_id));
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

create or replace function app_private.storage_object_project_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  parts text[];
begin
  parts := storage.foldername(object_name);
  if array_length(parts, 1) < 2 or parts[1] <> 'projects' then
    return null;
  end if;

  return parts[2]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function app_private.storage_object_task_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  parts text[];
begin
  parts := storage.foldername(object_name);
  if array_length(parts, 1) < 4 or parts[1] <> 'projects' or parts[3] <> 'tasks' then
    return null;
  end if;

  return parts[4]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

grant execute on all functions in schema app_private to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_memberships enable row level security;
alter table public.tasks enable row level security;
alter table public.files enable row level security;
alter table public.profile_preferences enable row level security;
alter table public.work_type_definitions enable row level security;
alter table public.foundation_settings enable row level security;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or app_private.is_admin()
  or app_private.is_same_project_member(id)
);

drop policy if exists "projects_select_accessible" on public.projects;
create policy "projects_select_accessible"
on public.projects
for select
to authenticated
using (app_private.can_access_project(id));

drop policy if exists "projects_insert_admin" on public.projects;
create policy "projects_insert_admin"
on public.projects
for insert
to authenticated
with check (app_private.is_admin());

drop policy if exists "projects_update_manager" on public.projects;
create policy "projects_update_manager"
on public.projects
for update
to authenticated
using (app_private.can_manage_project(id))
with check (app_private.can_manage_project(id));

drop policy if exists "project_memberships_select_project_access" on public.project_memberships;
create policy "project_memberships_select_project_access"
on public.project_memberships
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "project_memberships_insert_manager" on public.project_memberships;
create policy "project_memberships_insert_manager"
on public.project_memberships
for insert
to authenticated
with check (app_private.can_manage_project(project_id));

drop policy if exists "project_memberships_update_manager" on public.project_memberships;
create policy "project_memberships_update_manager"
on public.project_memberships
for update
to authenticated
using (app_private.can_manage_project(project_id))
with check (app_private.can_manage_project(project_id));

drop policy if exists "project_memberships_delete_manager" on public.project_memberships;
create policy "project_memberships_delete_manager"
on public.project_memberships
for delete
to authenticated
using (app_private.can_manage_project(project_id));

drop policy if exists "tasks_select_project_access" on public.tasks;
create policy "tasks_select_project_access"
on public.tasks
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "tasks_insert_project_access" on public.tasks;
create policy "tasks_insert_project_access"
on public.tasks
for insert
to authenticated
with check (app_private.can_access_project(project_id));

drop policy if exists "tasks_update_project_access" on public.tasks;
create policy "tasks_update_project_access"
on public.tasks
for update
to authenticated
using (app_private.can_access_project(project_id))
with check (app_private.can_access_project(project_id));

drop policy if exists "files_select_project_access" on public.files;
create policy "files_select_project_access"
on public.files
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "files_insert_project_access" on public.files;
create policy "files_insert_project_access"
on public.files
for insert
to authenticated
with check (app_private.can_access_project(project_id));

drop policy if exists "files_update_project_access" on public.files;
create policy "files_update_project_access"
on public.files
for update
to authenticated
using (app_private.can_access_project(project_id))
with check (app_private.can_access_project(project_id));

drop policy if exists "profile_preferences_select_own" on public.profile_preferences;
create policy "profile_preferences_select_own"
on public.profile_preferences
for select
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "profile_preferences_insert_own" on public.profile_preferences;
create policy "profile_preferences_insert_own"
on public.profile_preferences
for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "profile_preferences_update_own" on public.profile_preferences;
create policy "profile_preferences_update_own"
on public.profile_preferences
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "profile_preferences_delete_own" on public.profile_preferences;
create policy "profile_preferences_delete_own"
on public.profile_preferences
for delete
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "work_type_definitions_select_visible" on public.work_type_definitions;
create policy "work_type_definitions_select_visible"
on public.work_type_definitions
for select
to authenticated
using (project_id is null or app_private.can_access_project(project_id));

drop policy if exists "work_type_definitions_insert_manager" on public.work_type_definitions;
create policy "work_type_definitions_insert_manager"
on public.work_type_definitions
for insert
to authenticated
with check (
  (project_id is null and app_private.is_admin())
  or app_private.can_manage_project(project_id)
);

drop policy if exists "work_type_definitions_update_manager" on public.work_type_definitions;
create policy "work_type_definitions_update_manager"
on public.work_type_definitions
for update
to authenticated
using (
  (project_id is null and app_private.is_admin())
  or app_private.can_manage_project(project_id)
)
with check (
  (project_id is null and app_private.is_admin())
  or app_private.can_manage_project(project_id)
);

drop policy if exists "work_type_definitions_delete_manager" on public.work_type_definitions;
create policy "work_type_definitions_delete_manager"
on public.work_type_definitions
for delete
to authenticated
using (
  (project_id is null and app_private.is_admin())
  or app_private.can_manage_project(project_id)
);

drop policy if exists "foundation_settings_select_admin" on public.foundation_settings;
create policy "foundation_settings_select_admin"
on public.foundation_settings
for select
to authenticated
using (app_private.is_admin());

drop policy if exists "foundation_settings_update_admin" on public.foundation_settings;
create policy "foundation_settings_update_admin"
on public.foundation_settings
for update
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "storage_project_object_select" on storage.objects;
create policy "storage_project_object_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'task-files'
  and app_private.can_access_project(app_private.storage_object_project_id(name))
);

drop policy if exists "storage_project_object_insert" on storage.objects;
create policy "storage_project_object_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'task-files'
  and app_private.can_access_task(
    app_private.storage_object_project_id(name),
    app_private.storage_object_task_id(name)
  )
);

drop policy if exists "storage_project_object_update" on storage.objects;
create policy "storage_project_object_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'task-files'
  and (
    app_private.can_manage_project(app_private.storage_object_project_id(name))
    or owner_id::text = (select auth.uid())::text
  )
)
with check (
  bucket_id = 'task-files'
  and app_private.can_access_task(
    app_private.storage_object_project_id(name),
    app_private.storage_object_task_id(name)
  )
);

drop policy if exists "storage_project_object_delete" on storage.objects;
create policy "storage_project_object_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'task-files'
  and (
    app_private.can_manage_project(app_private.storage_object_project_id(name))
    or owner_id::text = (select auth.uid())::text
  )
);

commit;
