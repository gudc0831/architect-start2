alter table "profile_preferences"
  add column if not exists "ai_local_codex_no_history" boolean not null default false;
