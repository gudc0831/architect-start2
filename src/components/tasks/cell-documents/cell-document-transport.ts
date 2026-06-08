"use client";

import { buildTaskCellDocumentTopic, type TaskCellDocumentFieldKey } from "@/domains/task/cell-documents";

export type CellDocumentTransportEvent = {
  topic: string;
  projectId: string;
  taskId: string;
  fieldKey: TaskCellDocumentFieldKey;
  clientUpdateId: string;
  updateBase64: string;
  sourceId: string;
  occurredAt: string;
};

const CHANNEL_NAME = "architect-start.task-cell-documents";

let sourceId: string | null = null;

export function publishCellDocumentUpdateEvent(input: Omit<CellDocumentTransportEvent, "topic" | "sourceId" | "occurredAt">) {
  const event = {
    ...input,
    topic: buildTaskCellDocumentTopic(input.projectId, input.taskId, input.fieldKey),
    sourceId: getSourceId(),
    occurredAt: new Date().toISOString(),
  } satisfies CellDocumentTransportEvent;

  if (canUseBroadcastChannel()) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(event);
    channel.close();
  }
}

export function subscribeCellDocumentUpdateEvents(
  input: { projectId: string; taskId: string; fieldKey: TaskCellDocumentFieldKey },
  handler: (event: CellDocumentTransportEvent) => void,
) {
  const topic = buildTaskCellDocumentTopic(input.projectId, input.taskId, input.fieldKey);
  const ownSourceId = getSourceId();
  const cleanup: Array<() => void> = [];
  const handleEvent = (event: CellDocumentTransportEvent | null) => {
    if (!event || event.topic !== topic || event.sourceId === ownSourceId) {
      return;
    }

    handler(event);
  };

  if (canUseBroadcastChannel()) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (message) => handleEvent(readCellDocumentTransportEvent(message.data));
    cleanup.push(() => channel.close());
  }

  return () => {
    for (const remove of cleanup) {
      remove();
    }
  };
}

function readCellDocumentTransportEvent(value: unknown): CellDocumentTransportEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as Partial<CellDocumentTransportEvent>;
  if (
    typeof event.topic !== "string" ||
    typeof event.projectId !== "string" ||
    typeof event.taskId !== "string" ||
    typeof event.fieldKey !== "string" ||
    typeof event.clientUpdateId !== "string" ||
    typeof event.updateBase64 !== "string" ||
    typeof event.sourceId !== "string" ||
    typeof event.occurredAt !== "string"
  ) {
    return null;
  }

  return event as CellDocumentTransportEvent;
}

function getSourceId() {
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
