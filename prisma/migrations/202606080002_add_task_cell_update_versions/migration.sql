alter table task_cell_updates
  add column if not exists document_version integer not null default 1;

create index if not exists task_cell_updates_document_version
  on task_cell_updates(cell_document_id, document_version);
