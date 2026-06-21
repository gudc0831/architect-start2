import { randomUUID } from "node:crypto";

import type { DailyRowSyncEventName } from "@/components/tasks/daily-row-sync-bus";
import {
  DAILY_ROW_SYNC_SUPABASE_EVENT_NAME,
  buildDailyRowSyncProjectScopeKey,
  buildDailyRowSyncSupabaseChannelName,
} from "@/domains/task/daily-row-realtime";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type DailyRowRealtimeInvalidationInput = {
  actorProfileId: string;
  clientMutationId?: string | null;
  name: DailyRowSyncEventName;
  operationType?: "create" | "update" | "delete" | "trash" | "restore" | "reorder";
  projectId: string;
  task?: unknown;
  taskId?: string | null;
};

export async function publishDailyRowRealtimeInvalidation(input: DailyRowRealtimeInvalidationInput) {
  try {
    const scopeKey = buildDailyRowSyncProjectScopeKey(input.projectId);
    const supabase = createSupabaseAdminClient();
    const channel = supabase.channel(buildDailyRowSyncSupabaseChannelName(scopeKey), {
      config: {
        broadcast: { self: false },
        private: true,
      },
    });

    await channel.httpSend(
      DAILY_ROW_SYNC_SUPABASE_EVENT_NAME,
      {
        clientMutationId: input.clientMutationId ?? undefined,
        name: input.name,
        occurredAt: new Date().toISOString(),
        operationType: input.operationType,
        projectId: input.projectId,
        profileId: input.actorProfileId,
        scopeKey,
        serverTaskId: input.taskId ?? null,
        sourceId: `server:${randomUUID()}`,
        task: input.task,
        taskId: input.taskId ?? null,
      },
      { timeout: 5_000 },
    );
    void supabase.removeChannel(channel);
  } catch {
    // Realtime invalidation is best-effort; the committed row remains recoverable by HTTP polling/focus catch-up.
  }
}
