-- Invitation and access-request RLS policies for Architect Start Preview.
-- Apply only after migration 202604290003_add_invitations_and_access_requests.

begin;

alter table public.project_invitations enable row level security;
alter table public.access_requests enable row level security;

drop policy if exists "project_invitations_select_manager" on public.project_invitations;
create policy "project_invitations_select_manager"
on public.project_invitations
for select
to authenticated
using (app_private.can_manage_project(project_id));

drop policy if exists "project_invitations_insert_manager" on public.project_invitations;
create policy "project_invitations_insert_manager"
on public.project_invitations
for insert
to authenticated
with check (
  app_private.can_manage_project(project_id)
  and app_private.can_manage_project_membership_role(project_id, role)
);

drop policy if exists "project_invitations_update_manager" on public.project_invitations;
create policy "project_invitations_update_manager"
on public.project_invitations
for update
to authenticated
using (
  app_private.can_manage_project(project_id)
  or accepted_by_profile_id = (select auth.uid())
)
with check (
  app_private.can_manage_project(project_id)
  or accepted_by_profile_id = (select auth.uid())
);

drop policy if exists "access_requests_select_visible" on public.access_requests;
create policy "access_requests_select_visible"
on public.access_requests
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or app_private.is_admin()
  or (project_id is not null and app_private.can_manage_project(project_id))
);

drop policy if exists "access_requests_insert_own" on public.access_requests;
create policy "access_requests_insert_own"
on public.access_requests
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and status = 'pending'::"AccessRequestStatus"
  and project_id is null
  and requested_role in ('viewer'::"ProjectMembershipRole", 'editor'::"ProjectMembershipRole")
);

drop policy if exists "access_requests_update_reviewer" on public.access_requests;
create policy "access_requests_update_reviewer"
on public.access_requests
for update
to authenticated
using (
  app_private.is_admin()
  or (project_id is not null and app_private.can_manage_project(project_id))
)
with check (
  app_private.is_admin()
  or (
    project_id is not null
    and app_private.can_manage_project(project_id)
    and requested_role in ('viewer'::"ProjectMembershipRole", 'editor'::"ProjectMembershipRole")
  )
);

commit;
