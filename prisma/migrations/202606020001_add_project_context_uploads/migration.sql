create unique index if not exists "tasks_project_id_id_key"
  on "tasks"("project_id", "id");

create table if not exists "project_upload_source" (
  "source_id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "canonical_title" text not null,
  "source_type" text not null,
  "authority_type" text not null default 'project_context',
  "created_by_user_id" uuid not null references "profiles"("id") on delete restrict,
  "latest_active_version_id" uuid,
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null default now(),
  constraint "project_upload_source_project_source_key" unique ("project_id", "source_id"),
  constraint "project_upload_source_canonical_title_nonempty" check (length(btrim("canonical_title")) > 0),
  constraint "project_upload_source_source_type_nonempty" check (length(btrim("source_type")) > 0),
  constraint "project_upload_source_authority_type_check" check ("authority_type" = 'project_context')
);

create table if not exists "project_upload_version" (
  "version_id" uuid primary key default gen_random_uuid(),
  "source_id" uuid not null references "project_upload_source"("source_id") on delete cascade,
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "content_hash" text not null,
  "version_no" integer not null,
  "status" text not null default 'uploaded',
  "normalization_rule_version" text not null default 'v1',
  "parser_version" text not null default 'v1',
  "processed_at" timestamptz(6),
  "activated_at" timestamptz(6),
  "activated_by_user_id" uuid references "profiles"("id") on delete set null,
  "archived_at" timestamptz(6),
  "rejected_at" timestamptz(6),
  "failure_code" text,
  "failure_message" text,
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null default now(),
  constraint "project_upload_version_source_version_no_key" unique ("source_id", "version_no"),
  constraint "project_upload_version_project_source_version_key" unique ("project_id", "source_id", "version_id"),
  constraint "project_upload_version_project_source_fkey" foreign key ("project_id", "source_id") references "project_upload_source"("project_id", "source_id") on delete cascade,
  constraint "project_upload_version_content_hash_nonempty" check (length(btrim("content_hash")) > 0),
  constraint "project_upload_version_version_no_positive" check ("version_no" > 0),
  constraint "project_upload_version_status_check" check ("status" in ('uploaded', 'extracting', 'normalized_draft', 'review_pending', 'active', 'archived', 'rejected', 'failed')),
  constraint "project_upload_version_normalization_rule_version_nonempty" check (length(btrim("normalization_rule_version")) > 0),
  constraint "project_upload_version_parser_version_nonempty" check (length(btrim("parser_version")) > 0)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_upload_source_latest_active_version_project_source_fkey'
  ) then
    alter table "project_upload_source"
      add constraint "project_upload_source_latest_active_version_project_source_fkey"
      foreign key ("project_id", "source_id", "latest_active_version_id")
      references "project_upload_version"("project_id", "source_id", "version_id");
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_upload_source_latest_active_version_id_fkey'
  ) then
    alter table "project_upload_source"
      add constraint "project_upload_source_latest_active_version_id_fkey"
      foreign key ("latest_active_version_id")
      references "project_upload_version"("version_id")
      on delete set null;
  end if;
end $$;

create or replace function public.ensure_project_upload_latest_active_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.project_upload_source source
    left join public.project_upload_version version
      on version.project_id = source.project_id
      and version.source_id = source.source_id
      and version.version_id = source.latest_active_version_id
    where source.latest_active_version_id is not null
      and (version.version_id is null or version.status <> 'active')
  ) then
    raise exception 'project_upload_source.latest_active_version_id must reference an active version for the same project source';
  end if;

  return null;
end;
$$;

drop trigger if exists "project_upload_source_latest_active_status_guard" on public.project_upload_source;
create constraint trigger "project_upload_source_latest_active_status_guard"
after insert or update on public.project_upload_source
deferrable initially deferred
for each row execute function public.ensure_project_upload_latest_active_version();

drop trigger if exists "project_upload_version_latest_active_status_guard" on public.project_upload_version;
create constraint trigger "project_upload_version_latest_active_status_guard"
after update or delete on public.project_upload_version
deferrable initially deferred
for each row execute function public.ensure_project_upload_latest_active_version();

create table if not exists "upload_reference" (
  "upload_id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "source_id" uuid not null references "project_upload_source"("source_id") on delete cascade,
  "version_id" uuid not null references "project_upload_version"("version_id") on delete cascade,
  "uploaded_task_id" uuid,
  "uploaded_by_user_id" uuid not null references "profiles"("id") on delete restrict,
  "raw_storage_key" text,
  "raw_retention_until" timestamptz(6) not null default (now() + interval '7 days'),
  "raw_deleted_at" timestamptz(6),
  "raw_deletion_status" text not null default 'pending',
  "original_filename" text not null,
  "mime_type" text not null,
  "file_size_bytes" bigint not null,
  "malware_scan_status" text not null default 'pending',
  "created_at" timestamptz(6) not null default now(),
  constraint "upload_reference_project_source_version_upload_key" unique ("project_id", "source_id", "version_id", "upload_id"),
  constraint "upload_reference_project_source_fkey" foreign key ("project_id", "source_id") references "project_upload_source"("project_id", "source_id") on delete cascade,
  constraint "upload_reference_project_source_version_fkey" foreign key ("project_id", "source_id", "version_id") references "project_upload_version"("project_id", "source_id", "version_id") on delete cascade,
  constraint "upload_reference_project_uploaded_task_fkey" foreign key ("project_id", "uploaded_task_id") references "tasks"("project_id", "id") on delete no action,
  constraint "upload_reference_original_filename_nonempty" check (length(btrim("original_filename")) > 0),
  constraint "upload_reference_file_size_bytes_nonnegative" check ("file_size_bytes" >= 0),
  constraint "upload_reference_raw_retention_after_created" check ("raw_retention_until" >= "created_at"),
  constraint "upload_reference_raw_deletion_status_check" check ("raw_deletion_status" in ('pending', 'deleted', 'delete_failed', 'retention_extended')),
  constraint "upload_reference_raw_deletion_status_consistency" check (
    ("raw_deletion_status" = 'deleted' and "raw_deleted_at" is not null)
    or ("raw_deletion_status" <> 'deleted' and "raw_deleted_at" is null)
  ),
  constraint "upload_reference_malware_scan_status_check" check ("malware_scan_status" in ('pending', 'clean', 'infected', 'failed'))
);

create table if not exists "project_upload_chunk" (
  "chunk_id" uuid primary key default gen_random_uuid(),
  "version_id" uuid not null references "project_upload_version"("version_id") on delete cascade,
  "source_id" uuid not null references "project_upload_source"("source_id") on delete cascade,
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "upload_id" uuid not null references "upload_reference"("upload_id") on delete cascade,
  "source_document_title" text not null,
  "normalized_text" text not null,
  "source_quote" text not null,
  "context_type" text not null,
  "authority" text not null default 'project_context',
  "allowed_use" text not null default 'task_review_context_only',
  "chunk_quality_score" double precision not null default 0,
  "injection_risk" text not null default 'none',
  "embedding_model" text,
  "embedding_json" jsonb,
  "created_at" timestamptz(6) not null default now(),
  constraint "project_upload_chunk_project_source_fkey" foreign key ("project_id", "source_id") references "project_upload_source"("project_id", "source_id") on delete cascade,
  constraint "project_upload_chunk_project_source_version_fkey" foreign key ("project_id", "source_id", "version_id") references "project_upload_version"("project_id", "source_id", "version_id") on delete cascade,
  constraint "project_upload_chunk_project_source_version_upload_fkey" foreign key ("project_id", "source_id", "version_id", "upload_id") references "upload_reference"("project_id", "source_id", "version_id", "upload_id") on delete cascade,
  constraint "project_upload_chunk_source_document_title_nonempty" check (length(btrim("source_document_title")) > 0),
  constraint "project_upload_chunk_normalized_text_nonempty" check (length(btrim("normalized_text")) > 0),
  constraint "project_upload_chunk_source_quote_nonempty" check (length(btrim("source_quote")) > 0),
  constraint "project_upload_chunk_context_type_nonempty" check (length(btrim("context_type")) > 0),
  constraint "project_upload_chunk_authority_check" check ("authority" = 'project_context'),
  constraint "project_upload_chunk_allowed_use_check" check ("allowed_use" = 'task_review_context_only'),
  constraint "project_upload_chunk_quality_score_range" check ("chunk_quality_score" >= 0 and "chunk_quality_score" <= 1),
  constraint "project_upload_chunk_injection_risk_check" check ("injection_risk" in ('none', 'suspected', 'blocked'))
);

create table if not exists "chunk_location" (
  "chunk_id" uuid primary key references "project_upload_chunk"("chunk_id") on delete cascade,
  "location_type" text not null,
  "line_start" integer,
  "line_end" integer,
  "page_number" integer,
  "paragraph_index" integer,
  "sheet_name" text,
  "row_start" integer,
  "row_end" integer,
  "cell_range" text,
  "message_index_start" integer,
  "message_index_end" integer,
  "sender" text,
  "timestamp_start" timestamptz(6),
  "timestamp_end" timestamptz(6),
  "heading_path" jsonb,
  constraint "chunk_location_location_type_nonempty" check (length(btrim("location_type")) > 0),
  constraint "chunk_location_locator_present_check" check (
    "line_start" is not null
    or "line_end" is not null
    or "page_number" is not null
    or "paragraph_index" is not null
    or length(coalesce(btrim("sheet_name"), '')) > 0
    or "row_start" is not null
    or "row_end" is not null
    or length(coalesce(btrim("cell_range"), '')) > 0
    or "message_index_start" is not null
    or "message_index_end" is not null
    or length(coalesce(btrim("sender"), '')) > 0
    or "timestamp_start" is not null
    or "timestamp_end" is not null
    or "heading_path" is not null
  ),
  constraint "chunk_location_line_range_check" check ("line_start" is null or "line_end" is null or "line_end" >= "line_start"),
  constraint "chunk_location_row_range_check" check ("row_start" is null or "row_end" is null or "row_end" >= "row_start"),
  constraint "chunk_location_message_range_check" check ("message_index_start" is null or "message_index_end" is null or "message_index_end" >= "message_index_start"),
  constraint "chunk_location_timestamp_range_check" check ("timestamp_start" is null or "timestamp_end" is null or "timestamp_end" >= "timestamp_start")
);

create or replace function public.ensure_project_upload_chunk_location()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.project_upload_chunk chunk
    left join public.chunk_location location on location.chunk_id = chunk.chunk_id
    where location.chunk_id is null
  ) then
    raise exception 'project_upload_chunk requires chunk_location before it can be stored for review use';
  end if;

  return null;
end;
$$;

drop trigger if exists "project_upload_chunk_location_required" on public.project_upload_chunk;
create constraint trigger "project_upload_chunk_location_required"
after insert or update on public.project_upload_chunk
deferrable initially deferred
for each row execute function public.ensure_project_upload_chunk_location();

drop trigger if exists "chunk_location_parent_guard" on public.chunk_location;
create constraint trigger "chunk_location_parent_guard"
after update or delete on public.chunk_location
deferrable initially deferred
for each row execute function public.ensure_project_upload_chunk_location();

create table if not exists "review_corpus_trace" (
  "trace_id" uuid primary key default gen_random_uuid(),
  "review_id" uuid not null,
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "task_id" uuid not null,
  "query_hash" text not null,
  "corpus_type" text not null default 'project_context',
  "active_version_ids" jsonb not null default '[]'::jsonb,
  "candidate_chunk_ids" jsonb not null default '[]'::jsonb,
  "matched_chunk_ids" jsonb not null default '[]'::jsonb,
  "included_chunk_ids" jsonb not null default '[]'::jsonb,
  "corpus_status" text not null,
  "fallback_mode" text not null default 'none',
  "no_relevant_chunk_reason" text,
  "search_error_code" text,
  "searched_at" timestamptz(6) not null default now(),
  constraint "review_corpus_trace_query_hash_nonempty" check (length(btrim("query_hash")) > 0),
  constraint "review_corpus_trace_project_task_fkey" foreign key ("project_id", "task_id") references "tasks"("project_id", "id") on delete cascade,
  constraint "review_corpus_trace_corpus_type_check" check ("corpus_type" = 'project_context'),
  constraint "review_corpus_trace_corpus_status_check" check ("corpus_status" in ('chunks_found', 'active_corpus_missing', 'no_relevant_chunks', 'search_failed')),
  constraint "review_corpus_trace_fallback_mode_check" check ("fallback_mode" in ('none', 'legal_only_after_project_context_error')),
  constraint "review_corpus_trace_status_payload_check" check (
    (
      "corpus_status" = 'search_failed'
      and "fallback_mode" = 'legal_only_after_project_context_error'
      and length(btrim(coalesce("search_error_code", ''))) > 0
    )
    or (
      "corpus_status" = 'no_relevant_chunks'
      and "fallback_mode" = 'none'
      and "search_error_code" is null
      and length(btrim(coalesce("no_relevant_chunk_reason", ''))) > 0
    )
    or (
      "corpus_status" in ('chunks_found', 'active_corpus_missing')
      and "fallback_mode" = 'none'
      and "search_error_code" is null
    )
  )
);

create index if not exists "project_upload_source_project_latest_active_idx"
  on "project_upload_source"("project_id", "latest_active_version_id");

create index if not exists "project_upload_source_created_by_user_idx"
  on "project_upload_source"("created_by_user_id");

create index if not exists "project_upload_source_latest_active_version_idx"
  on "project_upload_source"("latest_active_version_id");

create index if not exists "project_upload_source_project_source_latest_active_idx"
  on "project_upload_source"("project_id", "source_id", "latest_active_version_id");

create index if not exists "project_upload_version_project_status_idx"
  on "project_upload_version"("project_id", "status");

create index if not exists "project_upload_version_source_status_activated_idx"
  on "project_upload_version"("source_id", "status", "activated_at" desc);

create index if not exists "project_upload_version_activated_by_user_idx"
  on "project_upload_version"("activated_by_user_id");

create index if not exists "upload_reference_project_uploader_created_idx"
  on "upload_reference"("project_id", "uploaded_by_user_id", "created_at" desc);

create index if not exists "upload_reference_raw_retention_deleted_idx"
  on "upload_reference"("raw_retention_until", "raw_deleted_at");

create index if not exists "upload_reference_source_idx"
  on "upload_reference"("source_id");

create index if not exists "upload_reference_version_idx"
  on "upload_reference"("version_id");

create index if not exists "upload_reference_uploaded_by_user_idx"
  on "upload_reference"("uploaded_by_user_id");

create index if not exists "upload_reference_project_uploaded_task_idx"
  on "upload_reference"("project_id", "uploaded_task_id");

create index if not exists "project_upload_chunk_project_version_idx"
  on "project_upload_chunk"("project_id", "version_id");

create index if not exists "project_upload_chunk_project_context_type_idx"
  on "project_upload_chunk"("project_id", "context_type");

create index if not exists "project_upload_chunk_version_idx"
  on "project_upload_chunk"("version_id");

create index if not exists "project_upload_chunk_source_idx"
  on "project_upload_chunk"("source_id");

create index if not exists "project_upload_chunk_upload_idx"
  on "project_upload_chunk"("upload_id");

create index if not exists "project_upload_chunk_project_source_idx"
  on "project_upload_chunk"("project_id", "source_id");

create index if not exists "project_upload_chunk_project_source_version_idx"
  on "project_upload_chunk"("project_id", "source_id", "version_id");

create index if not exists "project_upload_chunk_project_source_version_upload_idx"
  on "project_upload_chunk"("project_id", "source_id", "version_id", "upload_id");

create index if not exists "review_corpus_trace_review_corpus_type_idx"
  on "review_corpus_trace"("review_id", "corpus_type");

create index if not exists "review_corpus_trace_project_task_searched_idx"
  on "review_corpus_trace"("project_id", "task_id", "searched_at" desc);

alter table public.project_upload_source enable row level security;
alter table public.project_upload_version enable row level security;
alter table public.upload_reference enable row level security;
alter table public.project_upload_chunk enable row level security;
alter table public.chunk_location enable row level security;
alter table public.review_corpus_trace enable row level security;

drop policy if exists "project_upload_source_select_project_access" on public.project_upload_source;
create policy "project_upload_source_select_project_access"
on public.project_upload_source
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "project_upload_source_insert_project_editor" on public.project_upload_source;
create policy "project_upload_source_insert_project_editor"
on public.project_upload_source
for insert
to authenticated
with check (
  app_private.can_write_project(project_id)
  and (created_by_user_id = (select auth.uid()) or app_private.is_admin())
);

drop policy if exists "project_upload_source_update_project_editor" on public.project_upload_source;
create policy "project_upload_source_update_project_editor"
on public.project_upload_source
for update
to authenticated
using (app_private.can_write_project(project_id))
with check (app_private.can_write_project(project_id));

drop policy if exists "project_upload_version_select_project_access" on public.project_upload_version;
create policy "project_upload_version_select_project_access"
on public.project_upload_version
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "project_upload_version_insert_project_editor" on public.project_upload_version;
create policy "project_upload_version_insert_project_editor"
on public.project_upload_version
for insert
to authenticated
with check (
  app_private.can_write_project(project_id)
  and (activated_by_user_id is null or activated_by_user_id = (select auth.uid()) or app_private.is_admin())
);

drop policy if exists "project_upload_version_update_project_editor" on public.project_upload_version;
create policy "project_upload_version_update_project_editor"
on public.project_upload_version
for update
to authenticated
using (app_private.can_write_project(project_id))
with check (
  app_private.can_write_project(project_id)
  and (activated_by_user_id is null or activated_by_user_id = (select auth.uid()) or app_private.is_admin())
);

drop policy if exists "upload_reference_select_project_access" on public.upload_reference;
create policy "upload_reference_select_project_access"
on public.upload_reference
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "upload_reference_insert_project_editor" on public.upload_reference;
create policy "upload_reference_insert_project_editor"
on public.upload_reference
for insert
to authenticated
with check (
  app_private.can_write_project(project_id)
  and (uploaded_task_id is null or app_private.can_write_task(project_id, uploaded_task_id))
  and (uploaded_by_user_id = (select auth.uid()) or app_private.is_admin())
);

drop policy if exists "upload_reference_update_project_editor" on public.upload_reference;
create policy "upload_reference_update_project_editor"
on public.upload_reference
for update
to authenticated
using (app_private.can_write_project(project_id))
with check (
  app_private.can_write_project(project_id)
  and (uploaded_task_id is null or app_private.can_write_task(project_id, uploaded_task_id))
);

drop policy if exists "project_upload_chunk_select_project_access" on public.project_upload_chunk;
create policy "project_upload_chunk_select_project_access"
on public.project_upload_chunk
for select
to authenticated
using (app_private.can_access_project(project_id));

drop policy if exists "project_upload_chunk_insert_project_editor" on public.project_upload_chunk;
create policy "project_upload_chunk_insert_project_editor"
on public.project_upload_chunk
for insert
to authenticated
with check (app_private.can_write_project(project_id));

drop policy if exists "project_upload_chunk_update_project_editor" on public.project_upload_chunk;
create policy "project_upload_chunk_update_project_editor"
on public.project_upload_chunk
for update
to authenticated
using (app_private.can_write_project(project_id))
with check (app_private.can_write_project(project_id));

drop policy if exists "chunk_location_select_chunk_project_access" on public.chunk_location;
create policy "chunk_location_select_chunk_project_access"
on public.chunk_location
for select
to authenticated
using (
  exists (
    select 1
    from public.project_upload_chunk chunk
    where chunk.chunk_id = public.chunk_location.chunk_id
      and app_private.can_access_project(chunk.project_id)
  )
);

drop policy if exists "chunk_location_insert_chunk_project_editor" on public.chunk_location;
create policy "chunk_location_insert_chunk_project_editor"
on public.chunk_location
for insert
to authenticated
with check (
  exists (
    select 1
    from public.project_upload_chunk chunk
    where chunk.chunk_id = public.chunk_location.chunk_id
      and app_private.can_write_project(chunk.project_id)
  )
);

drop policy if exists "chunk_location_update_chunk_project_editor" on public.chunk_location;
create policy "chunk_location_update_chunk_project_editor"
on public.chunk_location
for update
to authenticated
using (
  exists (
    select 1
    from public.project_upload_chunk chunk
    where chunk.chunk_id = public.chunk_location.chunk_id
      and app_private.can_write_project(chunk.project_id)
  )
)
with check (
  exists (
    select 1
    from public.project_upload_chunk chunk
    where chunk.chunk_id = public.chunk_location.chunk_id
      and app_private.can_write_project(chunk.project_id)
  )
);

drop policy if exists "review_corpus_trace_select_task_access" on public.review_corpus_trace;
create policy "review_corpus_trace_select_task_access"
on public.review_corpus_trace
for select
to authenticated
using (app_private.can_access_task(project_id, task_id));

drop policy if exists "review_corpus_trace_insert_task_editor" on public.review_corpus_trace;
create policy "review_corpus_trace_insert_task_editor"
on public.review_corpus_trace
for insert
to authenticated
with check (app_private.can_write_task(project_id, task_id));

drop policy if exists "review_corpus_trace_update_task_editor" on public.review_corpus_trace;
create policy "review_corpus_trace_update_task_editor"
on public.review_corpus_trace
for update
to authenticated
using (app_private.can_write_task(project_id, task_id))
with check (app_private.can_write_task(project_id, task_id));
