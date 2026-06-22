create unique index if not exists "assistant_usage_events_request_hash_key"
  on "assistant_usage_events"("request_hash")
  where "request_hash" is not null
    and "execution_mode" = 'local-chatgpt-codex';
