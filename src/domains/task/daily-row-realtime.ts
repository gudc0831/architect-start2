export const DAILY_ROW_SYNC_CHANNEL_NAME = "architect-start.daily-row-sync";
export const DAILY_ROW_SYNC_SUPABASE_EVENT_NAME = "daily-row-sync";

export function buildDailyRowSyncProjectScopeKey(projectId: string) {
  return `project:${projectId}`;
}

export function buildDailyRowSyncSupabaseChannelName(scopeKey: string) {
  return `private:${DAILY_ROW_SYNC_CHANNEL_NAME}:${scopeKey}`;
}
