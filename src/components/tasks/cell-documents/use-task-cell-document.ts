"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { TextCellDocumentFieldKey } from "@/domains/task/cell-documents";
import {
  applyTaskCellYUpdate,
  createTaskCellYDocument,
  replaceTaskCellYText,
  uint8ArrayToBase64,
  type TaskCellYDocument,
} from "@/components/tasks/cell-documents/cell-document-store";
import {
  createCellDocumentUpdateId,
  deleteCellDocumentJournalOperation,
  putCellDocumentJournalOperation,
} from "@/components/tasks/cell-documents/cell-document-journal";
import {
  publishCellDocumentUpdateEvent,
  subscribeCellDocumentUpdateEvents,
} from "@/components/tasks/cell-documents/cell-document-transport";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabaseClientConfig } from "@/lib/supabase/config";

type CellDocumentSnapshot = {
  id: string;
  projectId: string;
  taskId: string;
  fieldKey: TextCellDocumentFieldKey;
  version: number;
  plainText: string;
  yStateBase64: string | null;
};

export function useTaskCellDocument(input: {
  projectId: string;
  taskId: string;
  fieldKey: TextCellDocumentFieldKey;
  initialText: string;
}) {
  const [text, setTextState] = useState(input.initialText);
  const [status, setStatus] = useState<"idle" | "loading" | "local" | "syncing" | "failed">("idle");
  const documentRef = useRef<TaskCellYDocument | null>(null);
  const pendingUpdatesRef = useRef<Uint8Array[]>([]);

  const applySnapshot = useCallback((snapshot: CellDocumentSnapshot) => {
    const document = createTaskCellYDocument({
      plainText: snapshot.plainText,
      yStateBase64: snapshot.yStateBase64,
    });
    documentRef.current = document;
    pendingUpdatesRef.current = [];
    setTextState(document.text.toString());
    setStatus("idle");
  }, []);

  const catchUp = useCallback(async () => {
    setStatus((current) => (current === "syncing" || current === "local" ? current : "loading"));
    const response = await fetch(
      `/api/task-cell-documents/${encodeURIComponent(input.taskId)}/${encodeURIComponent(input.fieldKey)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      setStatus("failed");
      return;
    }

    const json = (await response.json()) as { data: CellDocumentSnapshot };
    applySnapshot(json.data);
  }, [applySnapshot, input.fieldKey, input.taskId]);

  useEffect(() => {
    documentRef.current = createTaskCellYDocument({ plainText: input.initialText });
    setTextState(input.initialText);
    void catchUp();
  }, [catchUp, input.initialText]);

  useEffect(() => {
    return subscribeCellDocumentUpdateEvents(
      {
        projectId: input.projectId,
        taskId: input.taskId,
        fieldKey: input.fieldKey,
      },
      (event) => {
        const current = documentRef.current;
        if (!current) {
          void catchUp();
          return;
        }

        try {
          const nextText = applyTaskCellYUpdate(current, event.updateBase64);
          setTextState(nextText);
        } catch {
          void catchUp();
        }
      },
    );
  }, [catchUp, input.fieldKey, input.projectId, input.taskId]);

  useEffect(() => {
    if (!hasSupabaseClientConfig()) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`project:${input.projectId}:task-cell-documents`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_cell_documents",
          filter: `project_id=eq.${input.projectId}`,
        },
        (payload) => {
          const row = ((payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) ?? {}) as {
            task_id?: unknown;
            field_key?: unknown;
          };
          if (row.task_id === input.taskId && row.field_key === input.fieldKey) {
            void catchUp();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [catchUp, input.fieldKey, input.projectId, input.taskId]);

  useEffect(() => {
    const handleCatchUp = () => void catchUp();
    window.addEventListener("focus", handleCatchUp);
    window.addEventListener("online", handleCatchUp);
    return () => {
      window.removeEventListener("focus", handleCatchUp);
      window.removeEventListener("online", handleCatchUp);
    };
  }, [catchUp]);

  const setText = useCallback((nextText: string) => {
    let current = documentRef.current;
    if (!current) {
      current = createTaskCellYDocument({ plainText: "" });
      documentRef.current = current;
    }

    const update = replaceTaskCellYText(current, nextText);
    if (update.byteLength > 0) {
      pendingUpdatesRef.current.push(update);
    }

    setTextState(nextText);
    setStatus("local");
  }, []);

  const commit = useCallback(async () => {
    const pendingUpdates = pendingUpdatesRef.current;
    if (pendingUpdates.length === 0) {
      setStatus("idle");
      return text;
    }

    const mergedUpdate = Y.mergeUpdates(pendingUpdates);
    const updateBase64 = uint8ArrayToBase64(mergedUpdate);
    const clientUpdateId = createCellDocumentUpdateId();
    const operationId = `${input.projectId}:${input.taskId}:${input.fieldKey}:${clientUpdateId}`;
    const now = new Date().toISOString();
    setStatus("syncing");

    await putCellDocumentJournalOperation({
      operationId,
      projectId: input.projectId,
      taskId: input.taskId,
      fieldKey: input.fieldKey,
      clientUpdateId,
      updateBase64,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      lastError: null,
    });

    try {
      const response = await fetch(
        `/api/task-cell-documents/${encodeURIComponent(input.taskId)}/${encodeURIComponent(input.fieldKey)}/updates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientUpdateId, updateBase64 }),
        },
      );

      if (!response.ok) {
        throw new Error(`Cell document update failed with ${response.status}`);
      }

      const json = (await response.json()) as { data: CellDocumentSnapshot };
      pendingUpdatesRef.current = [];
      applySnapshot(json.data);
      await deleteCellDocumentJournalOperation(operationId);
      publishCellDocumentUpdateEvent({
        projectId: input.projectId,
        taskId: input.taskId,
        fieldKey: input.fieldKey,
        clientUpdateId,
        updateBase64,
      });
      return json.data.plainText;
    } catch (error) {
      setStatus("failed");
      await putCellDocumentJournalOperation({
        operationId,
        projectId: input.projectId,
        taskId: input.taskId,
        fieldKey: input.fieldKey,
        clientUpdateId,
        updateBase64,
        status: "failed",
        createdAt: now,
        updatedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : "Cell document update failed.",
      });
      throw error;
    }
  }, [applySnapshot, input.fieldKey, input.projectId, input.taskId, text]);

  return {
    text,
    status,
    setText,
    commit,
  };
}
