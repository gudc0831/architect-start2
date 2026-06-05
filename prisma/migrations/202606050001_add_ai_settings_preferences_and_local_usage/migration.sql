alter table "profile_preferences"
  add column "ai_default_model" text not null default 'gpt-5-codex',
  add column "ai_reasoning_effort" text not null default 'medium',
  add column "ai_service_tier" text not null default 'auto',
  add column "ai_request_timeout_ms" integer not null default 120000,
  add column "ai_local_usage_default_range_days" integer not null default 30;

alter table "profile_preferences"
  add constraint "profile_preferences_ai_reasoning_effort_check"
  check ("ai_reasoning_effort" in ('minimal', 'low', 'medium', 'high'));

alter table "profile_preferences"
  add constraint "profile_preferences_ai_service_tier_check"
  check ("ai_service_tier" in ('auto', 'default', 'priority'));

alter table "profile_preferences"
  add constraint "profile_preferences_ai_request_timeout_ms_check"
  check ("ai_request_timeout_ms" between 30000 and 120000);

alter table "profile_preferences"
  add constraint "profile_preferences_ai_local_usage_range_check"
  check ("ai_local_usage_default_range_days" in (30, 90, 0));
