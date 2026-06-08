"use client";

import type { DailyMutationOperation, DailyMutationOperationType, DailyMutationScope } from "@/components/tasks/daily-mutation-journal";
import { buildDailyMutationScopeKey } from "@/components/tasks/daily-mutation-journal";

export type DailyRowSyncEventName = "daily-journal-updated" | "task-created" | "task-synced" | "task-failed";

export type DailyRowSyncEvent = {
  name: DailyRowSyncEventName;
  scopeKey: string;
  projectId: string;
  profileId: string;
  operationId?: string;
  clientMutationId?: string;
  operationType?: DailyMutationOperationType;
  taskId?: string | null;
  tempTaskId?: string | null;
  serverTaskId?: string | null;
  occurredAt: string;
  sourceId: string;
};

const DAILY_ROW_SYNC_CHANNEL_NAME = "architect-start.daily-row-sync";

let sourceId: string | null = null;

export function publishDailyRowSyncEvent(
  scope: DailyMutationScope,
  event: Omit<DailyRowSyncEvent, "scopeKey" | "projectId" | "profileId" | "occurredAt" | "sourceId">,
) {
  if (!canUseBroadcastChannel()) {
    return;
  }

  const channel = new BroadcastChannel(DAILY_ROW_SYNC_CHANNEL_NAME);
  channel.postMessage({
    ...event,
    scopeKey: buildDailyMutationScopeKey(scope),
    projectId: scope.projectId,
    profileId: scope.profileId,
    occurredAt: new Date().toISOString(),
    sourceId: getDailyRowSyncSourceId(),
  } satisfies DailyRowSyncEvent);
  channel.close();
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
  if (!canUseBroadcastChannel()) {
    return () => {};
  }

  const scopeKey = buildDailyMutationScopeKey(scope);
  const ownSourceId = getDailyRowSyncSourceId();
  const channel = new BroadcastChannel(DAILY_ROW_SYNC_CHANNEL_NAME);
  channel.onmessage = (message) => {
    const event = readDailyRowSyncEvent(message.data);
    if (!event || event.scopeKey !== scopeKey || event.sourceId === ownSourceId) {
      return;
    }

    handler(event);
  };

  return () => {
    channel.close();
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
