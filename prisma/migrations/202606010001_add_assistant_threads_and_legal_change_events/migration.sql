create table if not exists "assistant_threads" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "task_id" uuid references "tasks"("id") on delete set null,
  "profile_id" uuid not null references "profiles"("id") on delete cascade,
  "title" text not null,
  "summary" text not null default '',
  "summary_provenance" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "assistant_thread_messages" (
  "id" uuid primary key default gen_random_uuid(),
  "thread_id" uuid not null references "assistant_threads"("id") on delete cascade,
  "assistant_record_id" uuid references "assistant_task_records"("id") on delete set null,
  "role" text not null check ("role" in ('user', 'assistant', 'system')),
  "content" text not null,
  "evidence_snapshot" jsonb not null default '[]'::jsonb,
  "created_at" timestamptz not null default now()
);

create index if not exists "assistant_threads_project_task_updated_idx"
  on "assistant_threads"("project_id", "task_id", "updated_at" desc);

create index if not exists "assistant_thread_messages_thread_created_idx"
  on "assistant_thread_messages"("thread_id", "created_at");

alter table public.assistant_threads enable row level security;
alter table public.assistant_thread_messages enable row level security;

drop policy if exists "assistant_threads_select_project_task_access" on public.assistant_threads;
create policy "assistant_threads_select_project_task_access"
on public.assistant_threads
for select
to authenticated
using (
  app_private.can_access_project(project_id)
  and (task_id is null or app_private.can_access_task(project_id, task_id))
);

drop policy if exists "assistant_threads_insert_project_task_editor" on public.assistant_threads;
create policy "assistant_threads_insert_project_task_editor"
on public.assistant_threads
for insert
to authenticated
with check (
  (profile_id = (select auth.uid()) or app_private.is_admin())
  and app_private.can_write_project(project_id)
  and (task_id is null or app_private.can_write_task(project_id, task_id))
);

drop policy if exists "assistant_threads_update_author_or_admin" on public.assistant_threads;
create policy "assistant_threads_update_author_or_admin"
on public.assistant_threads
for update
to authenticated
using (
  app_private.can_write_project(project_id)
  and (task_id is null or app_private.can_write_task(project_id, task_id))
  and (profile_id = (select auth.uid()) or app_private.is_admin())
)
with check (
  app_private.can_write_project(project_id)
  and (task_id is null or app_private.can_write_task(project_id, task_id))
  and (profile_id = (select auth.uid()) or app_private.is_admin())
);

drop policy if exists "assistant_thread_messages_select_thread_access" on public.assistant_thread_messages;
create policy "assistant_thread_messages_select_thread_access"
on public.assistant_thread_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.assistant_threads thread
    where thread.id = thread_id
      and app_private.can_access_project(thread.project_id)
      and (thread.task_id is null or app_private.can_access_task(thread.project_id, thread.task_id))
  )
);

drop policy if exists "assistant_thread_messages_insert_thread_editor" on public.assistant_thread_messages;
create policy "assistant_thread_messages_insert_thread_editor"
on public.assistant_thread_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.assistant_threads thread
    where thread.id = thread_id
      and app_private.can_write_project(thread.project_id)
      and (thread.task_id is null or app_private.can_write_task(thread.project_id, thread.task_id))
      and (
        assistant_record_id is null
        or exists (
          select 1
          from public.assistant_task_records record
          where record.id = assistant_record_id
            and record.project_id = thread.project_id
            and (thread.task_id is null or record.task_id = thread.task_id)
            and app_private.can_access_task(record.project_id, record.task_id)
        )
      )
  )
);
