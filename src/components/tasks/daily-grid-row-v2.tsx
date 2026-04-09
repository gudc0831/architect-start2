"use client";

import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { memo, useCallback, useSyncExternalStore } from "react";
import clsx from "clsx";

import {
  buildLinkedDocumentsSummary,
  buildTaskListCellPresentation,
  createTaskListRowPresentationContext,
  getEditableTaskListField,
  isCenteredCategoricalColumn,
  type TaskListCellPresentation,
} from "@/components/tasks/task-grid-shared";
import type { TaskListRowMetricsStore } from "@/components/tasks/task-grid-metrics-store";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import { dailyTaskListColumns, formatTaskDisplayId, type TaskTreeRow } from "@/domains/task/daily-list";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import type { TaskListColumnKey } from "@/domains/preferences/types";
import { labelForField, labelForStatus } from "@/lib/ui-copy";

type TaskDropPosition = "before" | "after";

type TaskListRowInteractionSnapshot = {
  isSelectedRow: boolean;
  activeInlineColumnKey: TaskListColumnKey | null;
  taskDropPosition: TaskDropPosition | null;
  isDimmedRow: boolean;
};

type TaskListRowInteractionStore = {
  subscribeToTask(taskId: string, listener: () => void): () => void;
  getTaskSnapshot(taskId: string): TaskListRowInteractionSnapshot;
};

type DeadlineBadge = {
  label: string;
  tone: string;
};

type DailyGridRowV2Props = {
  row: TaskTreeRow;
  taskFiles: readonly FileRecord[];
  start: number;
  scrollMargin: number;
  gridTemplateColumns: string;
  interactionStore: TaskListRowInteractionStore;
  metricsStore: TaskListRowMetricsStore;
  currentDayKey: string;
  hideIssueIdOverdueBadge: boolean;
  isManualReorderDisabled: boolean;
  isHtmlDragReorderDisabled: boolean;
  isReorderingTasks: boolean;
  rowDraft: TaskRecord | null;
  inlineSavingFields: Partial<Record<TaskListColumnKey, boolean>>;
  workTypeDefinitions: readonly WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
  registerTaskListRowCellRef: (taskId: string, columnKey: TaskListColumnKey, node: HTMLDivElement | null) => void;
  focusTaskListEditableCell: (taskId: string, columnKey: TaskListColumnKey) => void;
  moveTaskByOffset: (taskId: string, offset: -1 | 1) => Promise<void> | void;
  handleTaskRowDragStart: (task: TaskRecord, event: ReactDragEvent<HTMLButtonElement>) => void;
  handleTaskRowDragOver: (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => void;
  handleTaskRowDrop: (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => Promise<void> | void;
  clearTaskDragInteraction: () => void;
  handleTaskListRowAutoFitDoubleClick: (taskId: string, event: ReactMouseEvent<HTMLElement>) => void;
  handleTaskListRowResizeStart: (taskId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  selectTask: (taskId: string) => void;
  isTaskOverdue: (task: TaskRecord, currentDayKey: string) => boolean;
  resolveTaskDeadlineBadge: (task: TaskRecord, currentDayKey: string) => DeadlineBadge | null;
};

function useTaskListRowMetrics(store: TaskListRowMetricsStore, taskId: string) {
  const subscribe = useCallback((listener: () => void) => store.subscribeRow(taskId, listener), [store, taskId]);
  const getSnapshot = useCallback(() => store.getRowSnapshot(taskId), [store, taskId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useTaskListRowInteraction(store: TaskListRowInteractionStore, taskId: string) {
  const subscribe = useCallback((listener: () => void) => store.subscribeToTask(taskId, listener), [store, taskId]);
  const getSnapshot = useCallback(() => store.getTaskSnapshot(taskId), [store, taskId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function renderTaskListCellContent(
  task: TaskRecord,
  presentation: TaskListCellPresentation,
  deadlineBadge: DeadlineBadge | null,
  hideIssueIdOverdueBadge: boolean,
  isHtmlDragReorderDisabled: boolean,
  isReorderingTasks: boolean,
  isManualReorderDisabled: boolean,
  isSelectedRow: boolean,
  moveTaskByOffset: (taskId: string, offset: -1 | 1) => Promise<void> | void,
  clearTaskDragInteraction: () => void,
  handleTaskRowDragStart: (task: TaskRecord, event: ReactDragEvent<HTMLButtonElement>) => void,
) {
  switch (presentation.kind) {
    case "tree":
      return (
        <div className="task-tree">
          {presentation.isChildTask ? (
            <span aria-hidden="true" className="task-tree__guides">
              {presentation.ancestorGuideFlags.map((hasNextSibling, index) => (
                <span className={clsx("task-tree__lane", hasNextSibling && "task-tree__lane--continue")} key={`${task.id}-lane-${index}`} />
              ))}
              <span className={clsx("task-tree__branch", presentation.isLastChild ? "task-tree__branch--last" : "task-tree__branch--middle")} />
            </span>
          ) : null}
          <button
            aria-label={presentation.actionId}
            className="task-tree__drag-handle"
            disabled={isHtmlDragReorderDisabled || isReorderingTasks}
            draggable={!isHtmlDragReorderDisabled && !isReorderingTasks}
            onClick={(event) => event.stopPropagation()}
            onDragEnd={clearTaskDragInteraction}
            onDragStart={(event) => handleTaskRowDragStart(task, event)}
            type="button"
          >
            <span aria-hidden="true" className="task-tree__drag-grip" />
          </button>
          <span
            className={clsx(
              "task-tree__badge",
              presentation.isParentTask && "task-tree__badge--parent",
              presentation.isChildTask && "task-tree__badge--child",
              presentation.isBranchTask && "task-tree__badge--branch",
            )}
          >
            {presentation.actionId}
          </span>
          {deadlineBadge && !hideIssueIdOverdueBadge ? (
            <span className={clsx("task-state__deadline-badge", `task-state__deadline-badge--${deadlineBadge.tone}`)}>
              {deadlineBadge.label}
            </span>
          ) : null}
          {isSelectedRow ? (
            <span className="task-tree__actions">
              <button
                aria-label="move up"
                className="task-tree__move-button"
                disabled={isManualReorderDisabled || isReorderingTasks}
                onClick={(event) => {
                  event.stopPropagation();
                  void moveTaskByOffset(task.id, -1);
                }}
                type="button"
              >
                위
              </button>
              <button
                aria-label="move down"
                className="task-tree__move-button"
                disabled={isManualReorderDisabled || isReorderingTasks}
                onClick={(event) => {
                  event.stopPropagation();
                  void moveTaskByOffset(task.id, 1);
                }}
                type="button"
              >
                아래
              </button>
            </span>
          ) : null}
        </div>
      );
    case "text":
      return presentation.text;
    case "title":
      return (
        <span
          className={clsx(
            "sheet-table__title-copy",
            presentation.isParentTask && "sheet-table__title-copy--parent",
            presentation.isChildTask && "sheet-table__title-copy--child",
            presentation.isBranchTask && "sheet-table__title-copy--branch",
          )}
        >
          {presentation.text}
        </span>
      );
    case "files":
      return (
        <>
          <strong>{presentation.primary}</strong>
          {presentation.secondary ? <small>{presentation.secondary}</small> : null}
        </>
      );
    case "readonly-checkbox":
      return (
        <span className="sheet-table__readonly-checkbox" aria-label={labelForField("calendarLinked")}>
          <input checked={presentation.checked} disabled readOnly tabIndex={-1} type="checkbox" />
        </span>
      );
    case "readonly-status":
      return <span className={clsx("status-pill", `status-pill--${presentation.value}`)}>{labelForStatus(presentation.value)}</span>;
    case "editable-date":
    case "editable-text":
      return presentation.value || "-";
    case "editable-checkbox":
      return (
        <span className="sheet-table__readonly-checkbox" aria-label={labelForField("calendarLinked")}>
          <input checked={presentation.checked} disabled readOnly tabIndex={-1} type="checkbox" />
        </span>
      );
    case "editable-categorical":
      return presentation.label;
  }
}

export const DailyGridRowV2 = memo(function DailyGridRowV2({
  row,
  taskFiles,
  start,
  scrollMargin,
  gridTemplateColumns,
  interactionStore,
  metricsStore,
  currentDayKey,
  hideIssueIdOverdueBadge,
  isManualReorderDisabled,
  isHtmlDragReorderDisabled,
  isReorderingTasks,
  rowDraft,
  inlineSavingFields,
  workTypeDefinitions,
  categoryDefinitionsByField,
  registerTaskListRowCellRef,
  focusTaskListEditableCell,
  moveTaskByOffset,
  handleTaskRowDragStart,
  handleTaskRowDragOver,
  handleTaskRowDrop,
  clearTaskDragInteraction,
  handleTaskListRowAutoFitDoubleClick,
  handleTaskListRowResizeStart,
  selectTask,
  isTaskOverdue,
  resolveTaskDeadlineBadge,
}: DailyGridRowV2Props) {
  const task = row.task;
  const { activeInlineColumnKey, isDimmedRow, isSelectedRow, taskDropPosition } = useTaskListRowInteraction(interactionStore, task.id);
  const rowMetrics = useTaskListRowMetrics(metricsStore, task.id);
  const linkedDocumentsDisplay = buildLinkedDocumentsSummary(task, taskFiles);
  const rowResizeAria = labelForField("actionId");
  const rowAutoFitAria = rowResizeAria;
  const isOverdueRow = isTaskOverdue(task, currentDayKey);
  const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);
  const rowPresentationContext = createTaskListRowPresentationContext({
    activeInlineColumnKey,
    task,
    row,
    rowDraft,
    linkedDocumentsDisplay,
    workTypeDefinitions,
    categoryDefinitionsByField,
  });

  return (
    <div
      aria-selected={isSelectedRow}
      className={clsx(
        "daily-grid-v2__row",
        isSelectedRow && "sheet-row--active",
        "task-state-row",
        `task-state-row--${task.status}`,
        isOverdueRow && "task-state-row--overdue",
        isDimmedRow && "task-state-row--dimmed",
        taskDropPosition && `task-state-row--drop-${taskDropPosition}`,
      )}
      data-task-grid-interaction="true"
      data-task-row-id={task.id}
      onClick={() => selectTask(task.id)}
      onDragOver={(event) => handleTaskRowDragOver(task, event)}
      onDrop={(event) => void handleTaskRowDrop(task, event)}
      role="row"
      style={{
        gridTemplateColumns,
        height: `${rowMetrics.outerHeight}px`,
        transform: `translateY(${start - scrollMargin}px)`,
      }}
    >
      {dailyTaskListColumns.map((column) => {
        const editableField = getEditableTaskListField(column.key);
        const presentation = buildTaskListCellPresentation(column.key, rowPresentationContext);
        const isEditableCell = Boolean(editableField);
        const isActiveInlineCell = activeInlineColumnKey === column.key;

        return (
          <div
            className={clsx("daily-grid-v2__cell", column.className)}
            data-grid-column={column.key}
            key={column.key}
            onDoubleClick={
              editableField
                ? (event) => {
                    const target = event.target;
                    if (rowDraft && target instanceof HTMLElement) {
                      const inlineEditor = target.closest('input, textarea, select, button[data-task-multiselect-trigger="true"]');
                      if (inlineEditor) {
                        return;
                      }
                    }

                    event.stopPropagation();
                    focusTaskListEditableCell(task.id, column.key);
                  }
                : undefined
            }
            role="gridcell"
          >
            <div
              className={clsx(
                "sheet-table__cell-shell",
                column.key === "actionId" && "sheet-table__cell-shell--tree",
                isActiveInlineCell && "sheet-table__cell-shell--active-inline",
              )}
              ref={(node) => registerTaskListRowCellRef(task.id, column.key, node)}
            >
              <div
                className={clsx(
                  "sheet-table__cell-content",
                  isEditableCell && "sheet-table__cell-content--editable",
                  isActiveInlineCell && "sheet-table__cell-content--overlay-hidden",
                  isCenteredCategoricalColumn(column.key) && "sheet-table__cell-content--centered",
                )}
              >
                {renderTaskListCellContent(
                  task,
                  presentation,
                  deadlineBadge,
                  hideIssueIdOverdueBadge,
                  isHtmlDragReorderDisabled,
                  isReorderingTasks,
                  isManualReorderDisabled,
                  isSelectedRow,
                  moveTaskByOffset,
                  clearTaskDragInteraction,
                  handleTaskRowDragStart,
                )}
              </div>
              <button
                aria-label={rowResizeAria}
                className="sheet-table__row-resize-handle"
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleTaskListRowAutoFitDoubleClick(task.id, event);
                }}
                onPointerDown={(event) => handleTaskListRowResizeStart(task.id, event)}
                title={rowAutoFitAria}
                type="button"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});
