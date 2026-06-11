alter table "profile_preferences"
  alter column "ai_default_model" set default 'gpt-5.5';

update "profile_preferences"
set "ai_default_model" = 'gpt-5.5'
where "ai_default_model" in ('gpt-5-codex', 'codex-default');
