create table if not exists task_cell_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  task_id uuid not null,
  field_key text not null,
  doc_type text not null default 'text',
  y_state bytea,
  plain_text text not null default '',
  scalar_value_json jsonb,
  version integer not null default 1,
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now(),
  updated_by uuid,
  constraint task_cell_documents_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade,
  constraint task_cell_documents_project_task_fkey
    foreign key (project_id, task_id) references tasks(project_id, id) on delete cascade
);

create unique index if not exists task_cell_documents_project_task_field_key
  on task_cell_documents(project_id, task_id, field_key);

create index if not exists task_cell_documents_project_updated_at_idx
  on task_cell_documents(project_id, updated_at);

create table if not exists task_cell_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  cell_document_id uuid not null,
  client_update_id text not null,
  actor_profile_id uuid not null,
  update_payload bytea not null,
  created_at timestamptz(6) not null default now(),
  constraint task_cell_updates_project_id_fkey
    foreign key (project_id) references projects(id) on delete cascade,
  constraint task_cell_updates_cell_document_id_fkey
    foreign key (cell_document_id) references task_cell_documents(id) on delete cascade
);

create unique index if not exists task_cell_updates_document_client_update
  on task_cell_updates(cell_document_id, client_update_id);

create index if not exists task_cell_updates_project_created_at_idx
  on task_cell_updates(project_id, created_at);
