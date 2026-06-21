drop policy if exists "architect project members can receive realtime messages" on realtime.messages;
create policy "architect project members can receive realtime messages"
on realtime.messages
for select
to authenticated
using (
  public.architect_realtime_project_id(realtime.topic()) is not null
  and exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = public.architect_realtime_project_id(realtime.topic())
      and pm.profile_id = auth.uid()
  )
);
