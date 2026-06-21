"use client";

import type { FocusEvent, KeyboardEvent } from "react";
import { useState } from "react";
import type { TaskRecord } from "@/domains/task/types";
import type { TextCellDocumentFieldKey } from "@/domains/task/cell-documents";
import { useTaskCellDocument } from "@/components/tasks/cell-documents/use-task-cell-document";

export function TaskCellEditor({
  fieldKey,
  task,
  onChange,
  onCancel,
  onCommitted,
}: {
  fieldKey: TextCellDocumentFieldKey;
  task: TaskRecord;
  onChange: (fieldKey: TextCellDocumentFieldKey, value: string) => void;
  onCancel: () => void;
  onCommitted: (fieldKey: TextCellDocumentFieldKey, value: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const initialText = String(task[fieldKey] ?? "");
  const cellDocument = useTaskCellDocument({
    projectId: task.projectId,
    taskId: task.id,
    fieldKey,
    initialText,
  });

  const commit = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      const nextText = await cellDocument.commit();
      onCommitted(fieldKey, nextText);
    } finally {
      setSaving(false);
    }
  };

  const handleBlur = (_event: FocusEvent<HTMLTextAreaElement>) => {
    void commit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void commit();
    }
  };

  return (
    <textarea
      aria-label={fieldKey}
      className="sheet-table__inline-input sheet-table__inline-textarea"
      data-cell-document-status={cellDocument.status}
      disabled={saving}
      onBlur={handleBlur}
      onChange={(event) => {
        const nextText = event.target.value;
        cellDocument.setText(nextText);
        onChange(fieldKey, nextText);
      }}
      onClick={stopEvent}
      onDoubleClick={stopEvent}
      onKeyDown={handleKeyDown}
      onPointerDown={stopEvent}
      rows={1}
      value={cellDocument.text}
    />
  );
}

function stopEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}
