"use client";

import { buildTaskCellDocumentTopic, type TaskCellDocumentFieldKey } from "@/domains/task/cell-documents";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabaseClientConfig } from "@/lib/supabase/config";

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
const SUPABASE_EVENT_NAME = "cell-document-update";
const SUPABASE_SUBSCRIBE_TIMEOUT_MS = 2_000;

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

  void publishSupabaseCellDocumentUpdateEvent(event);
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

  const removeSupabaseSubscription = subscribeSupabaseCellDocumentUpdateEvents(topic, handleEvent);
  if (removeSupabaseSubscription) {
    cleanup.push(removeSupabaseSubscription);
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

function buildSupabaseChannelName(topic: string) {
  return `private:${CHANNEL_NAME}:${topic}`;
}

function subscribeSupabaseCellDocumentUpdateEvents(
  topic: string,
  handler: (event: CellDocumentTransportEvent | null) => void,
) {
  if (!hasSupabaseClientConfig()) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(buildSupabaseChannelName(topic), {
      config: {
        broadcast: { self: false },
        private: true,
      },
    })
    .on("broadcast", { event: SUPABASE_EVENT_NAME }, (message) => {
      handler(readCellDocumentTransportEvent((message as { payload?: unknown }).payload));
    });

  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

async function publishSupabaseCellDocumentUpdateEvent(event: CellDocumentTransportEvent) {
  if (!hasSupabaseClientConfig()) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const channel = supabase.channel(buildSupabaseChannelName(event.topic), {
    config: {
      broadcast: { self: false },
      private: true,
    },
  });

  try {
    await waitForSupabaseSubscription(channel);
    await channel.send({
      event: SUPABASE_EVENT_NAME,
      payload: event,
      type: "broadcast",
    });
  } catch {
    // BroadcastChannel and HTTP catch-up remain the durable fallback.
  } finally {
    void supabase.removeChannel(channel);
  }
}

function waitForSupabaseSubscription(channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]>) {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("Supabase cell-document channel subscribe timeout")), SUPABASE_SUBSCRIBE_TIMEOUT_MS);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timeoutId);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        window.clearTimeout(timeoutId);
        reject(new Error(`Supabase cell-document channel subscribe failed: ${status}`));
      }
    });
  });
}
