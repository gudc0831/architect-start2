"use client";

import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import { DailyGridRowV2 } from "@/components/tasks/daily-grid-row-v2";
import type { TaskListRowMetricsStore } from "@/components/tasks/task-grid-metrics-store";
import {
  buildTaskListRowIndexMap,
  buildTaskListVirtualizerRangeExtractor,
  DAILY_TASK_TABLE_VIRTUAL_OVERSCAN,
} from "@/components/tasks/task-grid-virtualizer";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import type { TaskTreeRow } from "@/domains/task/daily-list";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import type { TaskListColumnKey } from "@/domains/preferences/types";

type TaskListRowInteractionSnapshot = {
  isSelectedRow: boolean;
  activeInlineColumnKey: TaskListColumnKey | null;
  taskDropPosition: "before" | "after" | null;
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

type RowResizeState = {
  taskId: string;
  startY: number;
  startHeight: number;
  currentHeight: number;
  pendingHeight: number;
};

type DailyGridBodyV2Props = {
  rows: readonly TaskTreeRow[];
  pinnedTaskIds: ReadonlySet<string>;
  gridTemplateColumns: string;
  totalWidth: number;
  wrapperRef: RefObject<HTMLDivElement | null>;
  metricsStore: TaskListRowMetricsStore;
  interactionStore: TaskListRowInteractionStore;
  filesByTaskId: Record<string, FileRecord[]>;
  currentDayKey: string;
  hideIssueIdOverdueBadge: boolean;
  isManualReorderDisabled: boolean;
  isHtmlDragReorderDisabled: boolean;
  isReorderingTasks: boolean;
  activeTaskListInlineEditRowId: string | null;
  draft: TaskRecord | null;
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
  selectTask: (taskId: string) => void;
  measureAutoFitRowHeight: (taskId: string) => number;
  onCommitRowHeight: (taskId: string, height: number) => void;
  isTaskOverdue: (task: TaskRecord, currentDayKey: string) => boolean;
  resolveTaskDeadlineBadge: (task: TaskRecord, currentDayKey: string) => DeadlineBadge | null;
};

function useTaskListRowMetricsSnapshot(store: TaskListRowMetricsStore) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function DailyGridBodyV2({
  rows,
  pinnedTaskIds,
  gridTemplateColumns,
  totalWidth,
  wrapperRef,
  metricsStore,
  interactionStore,
  filesByTaskId,
  currentDayKey,
  hideIssueIdOverdueBadge,
  isManualReorderDisabled,
  isHtmlDragReorderDisabled,
  isReorderingTasks,
  activeTaskListInlineEditRowId,
  draft,
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
  selectTask,
  measureAutoFitRowHeight,
  onCommitRowHeight,
  isTaskOverdue,
  resolveTaskDeadlineBadge,
}: DailyGridBodyV2Props) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<RowResizeState | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const viewportFrameRef = useRef<number | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const metricsSnapshot = useTaskListRowMetricsSnapshot(metricsStore);

  const rowIndexMap = useMemo(() => buildTaskListRowIndexMap(rows), [rows]);
  const pinnedIndexes = useMemo(
    () => rows.flatMap((row, index) => (pinnedTaskIds.has(row.task.id) ? [index] : [])),
    [pinnedTaskIds, rows],
  );
  const rangeExtractor = useMemo(() => buildTaskListVirtualizerRangeExtractor(pinnedIndexes), [pinnedIndexes]);

  const virtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: rows.length,
    estimateSize: (index) => metricsStore.getRowOuterHeight(rows[index]?.task.id ?? ""),
    getItemKey: (index) => rows[index]?.task.id ?? index,
    overscan: DAILY_TASK_TABLE_VIRTUAL_OVERSCAN,
    rangeExtractor,
    scrollMargin,
    useAnimationFrameWithResizeObserver: true,
  });

  const syncLayoutState = useCallback(() => {
    const body = bodyRef.current;
    const wrapper = wrapperRef.current;
    if (!body || !wrapper) {
      return;
    }

    const bodyBounds = body.getBoundingClientRect();
    setScrollMargin(bodyBounds.top + window.scrollY);

    const wrapperBounds = wrapper.getBoundingClientRect();
    const viewportTop = Math.max(0, wrapperBounds.top);
    const viewportBottom = Math.min(window.innerHeight, wrapperBounds.bottom);
    const visibleHeight = Math.max(0, viewportBottom - viewportTop);
    const fallbackHeight = Math.max(1, Math.min(window.innerHeight, Math.max(wrapperBounds.height, window.innerHeight)));
    metricsStore.setViewportState({
      height: visibleHeight > 0 ? visibleHeight : fallbackHeight,
      scrollTop: Math.max(0, -wrapperBounds.top),
    });
  }, [metricsStore, wrapperRef]);

  useLayoutEffect(() => {
    const scheduleSync = () => {
      if (viewportFrameRef.current !== null) {
        return;
      }

      viewportFrameRef.current = window.requestAnimationFrame(() => {
        viewportFrameRef.current = null;
        syncLayoutState();
      });
    };

    syncLayoutState();
    window.addEventListener("scroll", scheduleSync, { passive: true, capture: true });
    window.addEventListener("resize", scheduleSync);
    const resizeObserver = new ResizeObserver(() => scheduleSync());
    if (bodyRef.current) {
      resizeObserver.observe(bodyRef.current);
    }
    if (wrapperRef.current) {
      resizeObserver.observe(wrapperRef.current);
    }

    return () => {
      window.removeEventListener("scroll", scheduleSync, true);
      window.removeEventListener("resize", scheduleSync);
      resizeObserver.disconnect();
      if (viewportFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportFrameRef.current);
        viewportFrameRef.current = null;
      }
    };
  }, [syncLayoutState, wrapperRef]);

  useEffect(() => {
    virtualizer.measure();
  }, [metricsSnapshot.liveRowHeight, metricsSnapshot.rowHeights, rows.length, virtualizer]);

  const flushResizeFrame = useCallback(() => {
    const resizeState = resizeStateRef.current;
    if (!resizeState) {
      return;
    }

    resizeFrameRef.current = null;
    const rowIndex = rowIndexMap.get(resizeState.taskId);
    if (rowIndex === undefined) {
      return;
    }

    const nextHeight = resizeState.pendingHeight;
    if (resizeState.currentHeight === nextHeight) {
      return;
    }

    resizeState.currentHeight = nextHeight;
    metricsStore.setTransientRowHeight(resizeState.taskId, nextHeight);
    virtualizer.resizeItem(rowIndex, metricsStore.getRowOuterHeight(resizeState.taskId));
  }, [metricsStore, rowIndexMap, virtualizer]);

  const handleRowResizeMove = useCallback(
    (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      resizeState.pendingHeight = resizeState.startHeight + event.clientY - resizeState.startY;
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        flushResizeFrame();
      });
    },
    [flushResizeFrame],
  );

  const handleRowResizeEnd = useCallback(() => {
    const resizeState = resizeStateRef.current;
    if (!resizeState) {
      return;
    }

    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
      flushResizeFrame();
    }

    resizeStateRef.current = null;
    window.removeEventListener("pointermove", handleRowResizeMove);
    window.removeEventListener("pointerup", handleRowResizeEnd);
    window.removeEventListener("pointercancel", handleRowResizeEnd);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    onCommitRowHeight(resizeState.taskId, resizeState.currentHeight);
  }, [flushResizeFrame, handleRowResizeMove, onCommitRowHeight]);

  const handleTaskListRowResizeStart = useCallback(
    (taskId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      handleRowResizeEnd();

      const startHeight = metricsStore.getDisplayedRowHeight(taskId);
      resizeStateRef.current = {
        taskId,
        startY: event.clientY,
        startHeight,
        currentHeight: startHeight,
        pendingHeight: startHeight,
      };

      window.addEventListener("pointermove", handleRowResizeMove);
      window.addEventListener("pointerup", handleRowResizeEnd);
      window.addEventListener("pointercancel", handleRowResizeEnd);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    },
    [handleRowResizeEnd, handleRowResizeMove, metricsStore],
  );

  const handleTaskListRowAutoFitDoubleClick = useCallback(
    (taskId: string, event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const nextHeight = measureAutoFitRowHeight(taskId);
      onCommitRowHeight(taskId, nextHeight);
      const rowIndex = rowIndexMap.get(taskId);
      if (rowIndex !== undefined) {
        virtualizer.resizeItem(rowIndex, metricsStore.getRowOuterHeight(taskId));
      }
    },
    [measureAutoFitRowHeight, metricsStore, onCommitRowHeight, rowIndexMap, virtualizer],
  );

  return (
    <div
      className="daily-grid-v2__body"
      data-task-grid-interaction="true"
      ref={bodyRef}
      role="grid"
      style={{
        minWidth: `${totalWidth}px`,
        width: `${totalWidth}px`,
      }}
    >
      <div
        className="daily-grid-v2__spacer"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) {
            return null;
          }

          return (
            <DailyGridRowV2
              categoryDefinitionsByField={categoryDefinitionsByField}
              clearTaskDragInteraction={clearTaskDragInteraction}
              currentDayKey={currentDayKey}
              focusTaskListEditableCell={focusTaskListEditableCell}
              gridTemplateColumns={gridTemplateColumns}
              handleTaskListRowAutoFitDoubleClick={handleTaskListRowAutoFitDoubleClick}
              handleTaskListRowResizeStart={handleTaskListRowResizeStart}
              handleTaskRowDragOver={handleTaskRowDragOver}
              handleTaskRowDragStart={handleTaskRowDragStart}
              handleTaskRowDrop={handleTaskRowDrop}
              hideIssueIdOverdueBadge={hideIssueIdOverdueBadge}
              inlineSavingFields={inlineSavingFields}
              interactionStore={interactionStore}
              isHtmlDragReorderDisabled={isHtmlDragReorderDisabled}
              isManualReorderDisabled={isManualReorderDisabled}
              isReorderingTasks={isReorderingTasks}
              isTaskOverdue={isTaskOverdue}
              key={row.task.id}
              metricsStore={metricsStore}
              moveTaskByOffset={moveTaskByOffset}
              registerTaskListRowCellRef={registerTaskListRowCellRef}
              resolveTaskDeadlineBadge={resolveTaskDeadlineBadge}
              row={row}
              rowDraft={row.task.id === activeTaskListInlineEditRowId && draft?.id === row.task.id ? draft : null}
              scrollMargin={scrollMargin}
              selectTask={selectTask}
              start={virtualRow.start}
              taskFiles={filesByTaskId[row.task.id] ?? []}
              workTypeDefinitions={workTypeDefinitions}
            />
          );
        })}
      </div>
    </div>
  );
}
