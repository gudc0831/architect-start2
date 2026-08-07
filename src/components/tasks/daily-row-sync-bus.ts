"use client";

import type { DailyMutationOperation, DailyMutationOperationType, DailyMutationScope } from "@/components/tasks/daily-mutation-journal";
import { buildDailyMutationScopeKey } from "@/components/tasks/daily-mutation-journal";
import {
  DAILY_ROW_SYNC_CHANNEL_NAME,
  DAILY_ROW_SYNC_SUPABASE_EVENT_NAME,
  buildDailyRowSyncProjectScopeKey,
  buildDailyRowSyncSupabaseChannelName,
} from "@/domains/task/daily-row-realtime";
import type { TaskRecord } from "@/domains/task/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabaseClientConfig } from "@/lib/supabase/config";

export type DailyRowSyncEventName = "daily-journal-updated" | "task-created" | "task-synced" | "task-failed";

export type DailyRowSyncEvent = {
  name: DailyRowSyncEventName;
  scopeKey: string;
  projectId: string;
  profileId: string;
  operationId?: string;
  clientMutationId?: string;
  operationType?: DailyMutationOperationType;
  task?: TaskRecord | null;
  taskId?: string | null;
  tempTaskId?: string | null;
  serverTaskId?: string | null;
  occurredAt: string;
  sourceId: string;
};

const SUPABASE_SUBSCRIBE_TIMEOUT_MS = 2_000;

let sourceId: string | null = null;

export function publishDailyRowSyncEvent(
  scope: DailyMutationScope,
  event: Omit<DailyRowSyncEvent, "scopeKey" | "projectId" | "profileId" | "occurredAt" | "sourceId">,
) {
  const rowSyncEvent = {
    ...event,
    scopeKey: buildDailyMutationScopeKey(scope),
    projectId: scope.projectId,
    profileId: scope.profileId,
    occurredAt: new Date().toISOString(),
    sourceId: getDailyRowSyncSourceId(),
  } satisfies DailyRowSyncEvent;

  if (!canUseBroadcastChannel()) {
    void publishSupabaseDailyRowSyncEvent(rowSyncEvent);
    return;
  }

  const channel = new BroadcastChannel(DAILY_ROW_SYNC_CHANNEL_NAME);
  channel.postMessage(rowSyncEvent);
  channel.close();
  void publishSupabaseDailyRowSyncEvent(rowSyncEvent);
}

export function publishDailyRowSyncOperationEvent(scope: DailyMutationScope, name: DailyRowSyncEventName, operation: DailyMutationOperation) {
  publishDailyRowSyncEvent(scope, {
    name,
    operationId: operation.operationId,
    clientMutationId: operation.clientMutationId,
    operationType: operation.type,
    taskId: readOperationTaskId(operation),
    tempTaskId: operation.tempTaskId,
    serverTaskId: operation.serverTaskId,
  });
}

export function subscribeDailyRowSyncEvents(scope: DailyMutationScope, handler: (event: DailyRowSyncEvent) => void) {
  const scopeKey = buildDailyMutationScopeKey(scope);
  const projectScopeKey = buildDailyRowSyncProjectScopeKey(scope.projectId);
  const ownSourceId = getDailyRowSyncSourceId();
  const cleanup: Array<() => void> = [];
  const handleEvent = (event: DailyRowSyncEvent | null) => {
    if (
      !event ||
      event.projectId !== scope.projectId ||
      (event.scopeKey !== scopeKey && event.scopeKey !== projectScopeKey) ||
      event.sourceId === ownSourceId
    ) {
      return;
    }

    handler(event);
  };

  if (canUseBroadcastChannel()) {
    const channel = new BroadcastChannel(DAILY_ROW_SYNC_CHANNEL_NAME);
    channel.onmessage = (message) => handleEvent(readDailyRowSyncEvent(message.data));
    cleanup.push(() => channel.close());
  }

  const removeSupabaseSubscription = subscribeSupabaseDailyRowSyncEvents(scopeKey, handleEvent);
  if (removeSupabaseSubscription) {
    cleanup.push(removeSupabaseSubscription);
  }
  const removeSupabaseProjectSubscription = subscribeSupabaseDailyRowSyncEvents(projectScopeKey, handleEvent);
  if (removeSupabaseProjectSubscription) {
    cleanup.push(removeSupabaseProjectSubscription);
  }

  return () => {
    for (const remove of cleanup) {
      remove();
    }
  };
}

function readOperationTaskId(operation: DailyMutationOperation) {
  const payload = operation.payload;
  if (payload.kind === "create") {
    return payload.tempTask.id;
  }
  if (payload.kind === "reorder") {
    return null;
  }
  if (payload.kind === "file-trash") {
    return payload.affectedFile.taskId;
  }
  return payload.taskId;
}

function readDailyRowSyncEvent(value: unknown): DailyRowSyncEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as Partial<DailyRowSyncEvent>;
  if (
    typeof event.name !== "string" ||
    typeof event.scopeKey !== "string" ||
    typeof event.projectId !== "string" ||
    typeof event.profileId !== "string" ||
    typeof event.occurredAt !== "string" ||
    typeof event.sourceId !== "string"
  ) {
    return null;
  }

  if (!["daily-journal-updated", "task-created", "task-synced", "task-failed"].includes(event.name)) {
    return null;
  }

  return event as DailyRowSyncEvent;
}

function getDailyRowSyncSourceId() {
  if (sourceId) {
    return sourceId;
  }

  sourceId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return sourceId;
}

function canUseBroadcastChannel() {
  return typeof BroadcastChannel !== "undefined";
}

function subscribeSupabaseDailyRowSyncEvents(
  scopeKey: string,
  handler: (event: DailyRowSyncEvent | null) => void,
) {
  if (!hasSupabaseClientConfig()) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  let cancelled = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  void (async () => {
    await setSupabaseRealtimeAuth(supabase);
    if (cancelled) {
      return;
    }

    channel = supabase
      .channel(buildDailyRowSyncSupabaseChannelName(scopeKey), {
        config: {
          broadcast: { self: false },
          private: true,
        },
      })
      .on("broadcast", { event: DAILY_ROW_SYNC_SUPABASE_EVENT_NAME }, (message) => {
        handler(readDailyRowSyncEvent((message as { payload?: unknown }).payload));
      });

    channel.subscribe();
  })();
  return () => {
    cancelled = true;
    if (channel) {
      void supabase.removeChannel(channel);
    }
  };
}

async function publishSupabaseDailyRowSyncEvent(event: DailyRowSyncEvent) {
  if (!hasSupabaseClientConfig()) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  await setSupabaseRealtimeAuth(supabase);
  const channel = supabase.channel(buildDailyRowSyncSupabaseChannelName(event.scopeKey), {
    config: {
      broadcast: { self: false },
      private: true,
    },
  });

  try {
    await waitForSupabaseSubscription(channel);
    await channel.send({
      event: DAILY_ROW_SYNC_SUPABASE_EVENT_NAME,
      payload: event,
      type: "broadcast",
    });
  } catch {
    // IndexedDB journal, BroadcastChannel, postgres_changes, and focus catch-up remain the durable fallbacks.
  } finally {
    void supabase.removeChannel(channel);
  }
}

async function setSupabaseRealtimeAuth(supabase: ReturnType<typeof createSupabaseBrowserClient>) {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const accessToken = data.session?.access_token;
  if (accessToken) {
    supabase.realtime.setAuth(accessToken);
  }
}

function waitForSupabaseSubscription(channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]>) {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("Supabase daily row channel subscribe timeout")), SUPABASE_SUBSCRIBE_TIMEOUT_MS);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timeoutId);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        window.clearTimeout(timeoutId);
        reject(new Error(`Supabase daily row channel subscribe failed: ${status}`));
      }
    });
  });
}
