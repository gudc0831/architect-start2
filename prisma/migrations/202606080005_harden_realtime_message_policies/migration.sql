create or replace function public.architect_realtime_project_id(topic_name text)
returns uuid
language sql
immutable
as $$
  select coalesce(
    substring(topic_name from 'architect-start\.daily-row-sync:project:([0-9a-fA-F-]{36})'),
    substring(topic_name from 'architect-start\.daily-row-sync:([0-9a-fA-F-]{36}):'),
    substring(topic_name from 'architect-start\.task-cell-documents:project:([0-9a-fA-F-]{36}):')
  )::uuid;
$$;

drop policy if exists "architect project members can send realtime messages" on realtime.messages;
create policy "architect project members can send realtime messages"
on realtime.messages
for insert
to authenticated
with check (
  private is true
  and event = 'daily-row-sync'
  and public.architect_realtime_project_id(realtime.topic()) is not null
  and exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = public.architect_realtime_project_id(realtime.topic())
      and pm.profile_id = auth.uid()
  )
);
