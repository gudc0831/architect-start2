create or replace function public.architect_realtime_project_id(topic_name text)
returns uuid
language sql
immutable
as $$
  select coalesce(
    substring(topic_name from 'architect-start\.daily-row-sync:project:([0-9a-fA-F-]{36})'),
    substring(topic_name from 'architect-start\.daily-row-sync:([0-9a-fA-F-]{36}):'),
    substring(topic_name from 'architect-start\.task-cell-documents:([0-9a-fA-F-]{36}):')
  )::uuid;
$$;

drop policy if exists "architect project members can receive realtime messages" on realtime.messages;
create policy "architect project members can receive realtime messages"
on realtime.messages
for select
to authenticated
using (
  private is true
  and public.architect_realtime_project_id(realtime.topic()) is not null
  and exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = public.architect_realtime_project_id(realtime.topic())
      and pm.profile_id = auth.uid()
  )
);

drop policy if exists "architect project members can send realtime messages" on realtime.messages;
create policy "architect project members can send realtime messages"
on realtime.messages
for insert
to authenticated
with check (
  private is true
  and event in ('daily-row-sync', 'cell-document-update')
  and public.architect_realtime_project_id(realtime.topic()) is not null
  and exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = public.architect_realtime_project_id(realtime.topic())
      and pm.profile_id = auth.uid()
  )
);

create or replace function public.architect_broadcast_daily_task_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  actor_profile_id uuid;
  changed_task_id uuid;
  changed_project_id uuid;
  realtime_event text;
begin
  if tg_op = 'INSERT' then
    if not coalesce(new.is_daily, false) then
      return new;
    end if;
    changed_task_id := new.id;
    changed_project_id := new.project_id;
    actor_profile_id := coalesce(new.updated_by, new.created_by);
    realtime_event := 'task-created';
  elsif tg_op = 'UPDATE' then
    if not coalesce(new.is_daily, old.is_daily, false) then
      return new;
    end if;
    changed_task_id := new.id;
    changed_project_id := new.project_id;
    actor_profile_id := coalesce(new.updated_by, new.created_by, old.updated_by, old.created_by);
    realtime_event := 'task-synced';
  elsif tg_op = 'DELETE' then
    if not coalesce(old.is_daily, false) then
      return old;
    end if;
    changed_task_id := old.id;
    changed_project_id := old.project_id;
    actor_profile_id := coalesce(old.updated_by, old.created_by);
    realtime_event := 'task-synced';
  end if;

  perform realtime.send(
    jsonb_build_object(
      'name', realtime_event,
      'scopeKey', 'project:' || changed_project_id::text,
      'projectId', changed_project_id::text,
      'profileId', actor_profile_id::text,
      'operationType', lower(tg_op),
      'taskId', changed_task_id::text,
      'serverTaskId', changed_task_id::text,
      'occurredAt', now()::text,
      'sourceId', 'db:' || gen_random_uuid()::text
    ),
    'daily-row-sync',
    'private:architect-start.daily-row-sync:project:' || changed_project_id::text,
    true
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists architect_daily_task_realtime on public.tasks;
create trigger architect_daily_task_realtime
after insert or update or delete on public.tasks
for each row
execute function public.architect_broadcast_daily_task_change();
