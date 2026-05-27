create table "task_user_orders" (
  "id" uuid primary key default gen_random_uuid(),
  "project_id" uuid not null references "projects"("id") on delete cascade,
  "profile_id" uuid not null references "profiles"("id") on delete cascade,
  "task_id" uuid not null references "tasks"("id") on delete cascade,
  "parent_task_id" uuid references "tasks"("id") on delete set null,
  "sibling_order" integer not null default 0,
  "created_at" timestamptz(6) not null default now(),
  "updated_at" timestamptz(6) not null default now()
);

create unique index "task_user_orders_project_id_profile_id_task_id_key"
  on "task_user_orders" ("project_id", "profile_id", "task_id");

create index "task_user_orders_project_id_profile_id_parent_task_id_sibling_order_idx"
  on "task_user_orders" ("project_id", "profile_id", "parent_task_id", "sibling_order");

create index "task_user_orders_profile_id_idx"
  on "task_user_orders" ("profile_id");
