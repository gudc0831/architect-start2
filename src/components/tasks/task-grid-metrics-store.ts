import { clampTaskListRowHeight, type TaskListRowHeightMap } from "@/domains/preferences/types";

import {
  DAILY_TASK_TABLE_ROW_CHROME_HEIGHT,
  resolveTaskListDisplayedRowHeight,
  type TaskListDesktopViewportState,
  type TaskListLiveRowHeight,
} from "@/components/tasks/task-grid-virtualizer";

export type TaskListRowMetricsSnapshot = {
  rowHeights: TaskListRowHeightMap;
  viewport: TaskListDesktopViewportState;
  liveRowHeight: TaskListLiveRowHeight | null;
};

export type TaskListRowMetricsRowSnapshot = {
  taskId: string;
  durableHeight: number;
  displayedHeight: number;
  outerHeight: number;
  liveHeight: number | null;
  isLive: boolean;
};

export type TaskListRowMetricsStore = {
  subscribe(listener: () => void): () => void;
  subscribeRow(taskId: string, listener: () => void): () => void;
  getSnapshot(): TaskListRowMetricsSnapshot;
  getRowSnapshot(taskId: string): TaskListRowMetricsRowSnapshot;
  getDisplayedRowHeight(taskId: string): number;
  getRowOuterHeight(taskId: string): number;
  replaceRowHeights(rowHeights: TaskListRowHeightMap): void;
  setTransientRowHeight(taskId: string, height: number | null): void;
  commitRowHeight(taskId: string, height: number): void;
  setViewportState(viewport: TaskListDesktopViewportState): void;
};

export function createTaskListRowMetricsStore(initialSnapshot?: Partial<TaskListRowMetricsSnapshot>): TaskListRowMetricsStore {
  let snapshot: TaskListRowMetricsSnapshot = {
    rowHeights: initialSnapshot?.rowHeights ? { ...initialSnapshot.rowHeights } : {},
    viewport: initialSnapshot?.viewport ? { ...initialSnapshot.viewport } : { scrollTop: 0, height: 0 },
    liveRowHeight: initialSnapshot?.liveRowHeight ? { ...initialSnapshot.liveRowHeight } : null,
  };
  const listeners = new Set<() => void>();
  const listenersByTaskId = new Map<string, Set<() => void>>();
  const rowSnapshotCache = new Map<string, TaskListRowMetricsRowSnapshot>();

  const buildRowSnapshot = (nextSnapshot: TaskListRowMetricsSnapshot, taskId: string): TaskListRowMetricsRowSnapshot => {
    const durableHeight = nextSnapshot.rowHeights[taskId] ?? 0;
    const liveHeight = nextSnapshot.liveRowHeight?.taskId === taskId ? nextSnapshot.liveRowHeight.height : null;
    const displayedHeight = resolveTaskListDisplayedRowHeight(taskId, nextSnapshot.rowHeights, nextSnapshot.liveRowHeight);

    return {
      taskId,
      durableHeight,
      displayedHeight,
      outerHeight: displayedHeight + DAILY_TASK_TABLE_ROW_CHROME_HEIGHT,
      liveHeight,
      isLive: liveHeight !== null,
    };
  };

  const areRowSnapshotsEqual = (previous: TaskListRowMetricsRowSnapshot | undefined, next: TaskListRowMetricsRowSnapshot) =>
    Boolean(
      previous &&
        previous.durableHeight === next.durableHeight &&
        previous.displayedHeight === next.displayedHeight &&
        previous.outerHeight === next.outerHeight &&
        previous.liveHeight === next.liveHeight &&
        previous.isLive === next.isLive,
    );

  const notifyListeners = () => {
    listeners.forEach((listener) => listener());
  };

  const notifyRows = (taskIds: Set<string>) => {
    taskIds.forEach((taskId) => {
      const next = buildRowSnapshot(snapshot, taskId);
      const previous = rowSnapshotCache.get(taskId);
      if (areRowSnapshotsEqual(previous, next)) {
        return;
      }

      rowSnapshotCache.set(taskId, next);
      listenersByTaskId.get(taskId)?.forEach((listener) => listener());
    });
  };

  const areRowHeightMapsEqual = (previous: TaskListRowHeightMap, next: TaskListRowHeightMap) => {
    if (previous === next) {
      return true;
    }

    const previousEntries = Object.entries(previous);
    const nextEntries = Object.entries(next);
    if (previousEntries.length !== nextEntries.length) {
      return false;
    }

    return previousEntries.every(([taskId, height]) => next[taskId] === height);
  };

  const areViewportStatesEqual = (previous: TaskListDesktopViewportState, next: TaskListDesktopViewportState) =>
    previous.scrollTop === next.scrollTop && previous.height === next.height;

  const updateSnapshot = (nextSnapshot: TaskListRowMetricsSnapshot, affectedTaskIds?: Set<string>) => {
    const previousSnapshot = snapshot;
    snapshot = {
      rowHeights: { ...nextSnapshot.rowHeights },
      viewport: { ...nextSnapshot.viewport },
      liveRowHeight: nextSnapshot.liveRowHeight ? { ...nextSnapshot.liveRowHeight } : null,
    };

    notifyListeners();
    if (affectedTaskIds && affectedTaskIds.size > 0) {
      notifyRows(affectedTaskIds);
      return;
    }

    const inferredTaskIds = new Set<string>();
    if (previousSnapshot.liveRowHeight?.taskId) {
      inferredTaskIds.add(previousSnapshot.liveRowHeight.taskId);
    }
    if (snapshot.liveRowHeight?.taskId) {
      inferredTaskIds.add(snapshot.liveRowHeight.taskId);
    }
    if (previousSnapshot.rowHeights !== snapshot.rowHeights) {
      for (const taskId of Object.keys(previousSnapshot.rowHeights)) {
        inferredTaskIds.add(taskId);
      }
      for (const taskId of Object.keys(snapshot.rowHeights)) {
        inferredTaskIds.add(taskId);
      }
    }
    notifyRows(inferredTaskIds);
  };

  const updateSingleRowHeight = (taskId: string, height: number) => {
    const clampedHeight = clampTaskListRowHeight(height);
    if ((snapshot.rowHeights[taskId] ?? 0) === clampedHeight && snapshot.liveRowHeight?.taskId !== taskId) {
      return snapshot.rowHeights;
    }

    return {
      ...snapshot.rowHeights,
      [taskId]: clampedHeight,
    };
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeRow(taskId, listener) {
      const listenersForRow = listenersByTaskId.get(taskId) ?? new Set<() => void>();
      listenersForRow.add(listener);
      listenersByTaskId.set(taskId, listenersForRow);

      rowSnapshotCache.set(taskId, buildRowSnapshot(snapshot, taskId));

      return () => {
        const current = listenersByTaskId.get(taskId);
        if (!current) {
          return;
        }

        current.delete(listener);
        if (current.size === 0) {
          listenersByTaskId.delete(taskId);
          rowSnapshotCache.delete(taskId);
        }
      };
    },
    getSnapshot() {
      return snapshot;
    },
    getRowSnapshot(taskId) {
      const cached = rowSnapshotCache.get(taskId);
      if (cached) {
        return cached;
      }

      const next = buildRowSnapshot(snapshot, taskId);
      rowSnapshotCache.set(taskId, next);
      return next;
    },
    getDisplayedRowHeight(taskId) {
      return resolveTaskListDisplayedRowHeight(taskId, snapshot.rowHeights, snapshot.liveRowHeight);
    },
    getRowOuterHeight(taskId) {
      return resolveTaskListDisplayedRowHeight(taskId, snapshot.rowHeights, snapshot.liveRowHeight) + DAILY_TASK_TABLE_ROW_CHROME_HEIGHT;
    },
    replaceRowHeights(rowHeights) {
      const nextRowHeights = { ...rowHeights };
      if (areRowHeightMapsEqual(snapshot.rowHeights, nextRowHeights)) {
        return;
      }

      const affectedTaskIds = new Set<string>([...Object.keys(snapshot.rowHeights), ...Object.keys(nextRowHeights)]);
      updateSnapshot({ ...snapshot, rowHeights: nextRowHeights }, affectedTaskIds);
    },
    setTransientRowHeight(taskId, height) {
      const nextLiveRowHeight =
        height === null
          ? null
          : {
              taskId,
              height: clampTaskListRowHeight(height),
            };

      if (
        snapshot.liveRowHeight?.taskId === nextLiveRowHeight?.taskId &&
        snapshot.liveRowHeight?.height === nextLiveRowHeight?.height
      ) {
        return;
      }

      updateSnapshot({ ...snapshot, liveRowHeight: nextLiveRowHeight }, new Set<string>([taskId]));
    },
    commitRowHeight(taskId, height) {
      const nextRowHeights = updateSingleRowHeight(taskId, height);
      const nextLiveRowHeight = snapshot.liveRowHeight?.taskId === taskId ? null : snapshot.liveRowHeight;
      updateSnapshot({ ...snapshot, rowHeights: nextRowHeights, liveRowHeight: nextLiveRowHeight }, new Set<string>([taskId]));
    },
    setViewportState(viewport) {
      if (areViewportStatesEqual(snapshot.viewport, viewport)) {
        return;
      }

      updateSnapshot({ ...snapshot, viewport: { scrollTop: viewport.scrollTop, height: viewport.height } });
    },
  };
}
