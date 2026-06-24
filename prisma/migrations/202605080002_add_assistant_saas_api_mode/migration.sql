create table "assistant_run_policies" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null unique references "projects"("id") on delete cascade,
  "enabled" boolean not null default false,
  "provider" text not null default 'mock',
  "model" text not null default 'deterministic-foundation',
  "monthly_budget_cents" integer not null default 50000,
  "max_input_tokens" integer not null default 12000,
  "max_output_tokens" integer not null default 2000,
  "external_evidence_allowed" boolean not null default true,
  "allowed_evidence_kinds" jsonb not null default '["central_knowledge","regulation","task","project_document","web_or_skill"]'::jsonb,
  "retention_days" integer not null default 365,
  "created_by" uuid references "profiles"("id") on delete set null,
  "updated_by" uuid references "profiles"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create index "assistant_run_policies_enabled_updated_at_idx"
  on "assistant_run_policies"("enabled", "updated_at");

create table "assistant_usage_events" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "task_id" uuid references "tasks"("id") on delete set null,
  "profile_id" uuid not null references "profiles"("id") on delete cascade,
  "assistant_record_id" uuid references "assistant_task_records"("id") on delete set null,
  "execution_mode" text not null default 'saas-api',
  "runtime_mode" text not null default 'saas-api',
  "provider" text not null default 'mock',
  "model" text not null default 'deterministic-foundation',
  "input_tokens" integer not null default 0,
  "output_tokens" integer not null default 0,
  "estimated_cost_cents" integer not null default 0,
  "status" text not null default 'success',
  "policy_decision" text not null default 'allowed',
  "request_hash" text,
  "error_code" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now()
);

create index "assistant_usage_events_project_id_created_at_idx"
  on "assistant_usage_events"("project_id", "created_at");

create index "assistant_usage_events_task_id_created_at_idx"
  on "assistant_usage_events"("task_id", "created_at");

create index "assistant_usage_events_profile_id_created_at_idx"
  on "assistant_usage_events"("profile_id", "created_at");

create table "assistant_audit_events" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid references "projects"("id") on delete set null,
  "profile_id" uuid references "profiles"("id") on delete set null,
  "event_type" text not null,
  "target_type" text not null,
  "target_id" uuid,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now()
);

create index "assistant_audit_events_project_id_created_at_idx"
  on "assistant_audit_events"("project_id", "created_at");

create index "assistant_audit_events_profile_id_created_at_idx"
  on "assistant_audit_events"("profile_id", "created_at");

create index "assistant_audit_events_event_type_created_at_idx"
  on "assistant_audit_events"("event_type", "created_at");

alter table public.assistant_run_policies enable row level security;
alter table public.assistant_usage_events enable row level security;
alter table public.assistant_audit_events enable row level security;

drop policy if exists "assistant_run_policies_select_project_access" on public.assistant_run_policies;
create policy "assistant_run_policies_select_project_access"
on public.assistant_run_policies
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "assistant_run_policies_mutate_admin" on public.assistant_run_policies;
create policy "assistant_run_policies_mutate_admin"
on public.assistant_run_policies
for all
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "assistant_usage_events_select_project_access" on public.assistant_usage_events;
create policy "assistant_usage_events_select_project_access"
on public.assistant_usage_events
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "assistant_usage_events_insert_project_editor" on public.assistant_usage_events;
create policy "assistant_usage_events_insert_project_editor"
on public.assistant_usage_events
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and app_private.can_write_project(project_id)
);

drop policy if exists "assistant_audit_events_select_admin" on public.assistant_audit_events;
create policy "assistant_audit_events_select_admin"
on public.assistant_audit_events
for select
to authenticated
using (app_private.is_admin());

drop policy if exists "assistant_audit_events_insert_project_editor" on public.assistant_audit_events;
create policy "assistant_audit_events_insert_project_editor"
on public.assistant_audit_events
for insert
to authenticated
with check (
  profile_id = (select auth.uid()) or app_private.is_admin()
);
