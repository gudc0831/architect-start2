import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual";

import { TASK_LIST_ROW_MIN_HEIGHT, type TaskListRowHeightMap } from "@/domains/preferences/types";

export type TaskListDesktopViewportState = {
  scrollTop: number;
  height: number;
};

export type TaskListLiveRowHeight = {
  taskId: string;
  height: number;
};

export type TaskListVirtualizerRange = Range;

export type TaskListVirtualizerSegment = {
  start: number;
  end: number;
};

export const DAILY_TASK_TABLE_VIRTUAL_OVERSCAN = 2;
export const DAILY_TASK_TABLE_ROW_CHROME_HEIGHT = 1;

export function buildTaskListRowIndexMap(rows: readonly { task: { id: string } }[]) {
  return new Map(rows.map((row, index) => [row.task.id, index] as const));
}

export function resolveTaskListDisplayedRowHeight(
  taskId: string,
  rowHeights: TaskListRowHeightMap,
  liveRowHeight: TaskListLiveRowHeight | null,
  fallbackHeight = TASK_LIST_ROW_MIN_HEIGHT,
) {
  if (liveRowHeight?.taskId === taskId) {
    return liveRowHeight.height;
  }

  return rowHeights[taskId] ?? fallbackHeight;
}

export function resolveTaskListRowOuterHeight(
  taskId: string,
  rowHeights: TaskListRowHeightMap,
  liveRowHeight: TaskListLiveRowHeight | null,
  fallbackHeight = TASK_LIST_ROW_MIN_HEIGHT,
  rowChromeHeight = DAILY_TASK_TABLE_ROW_CHROME_HEIGHT,
) {
  return resolveTaskListDisplayedRowHeight(taskId, rowHeights, liveRowHeight, fallbackHeight) + rowChromeHeight;
}

export function mergePinnedIndexesWithVisibleRange(
  startIndex: number,
  endIndex: number,
  pinnedIndexes: readonly number[],
): TaskListVirtualizerSegment[] {
  const normalizedStartIndex = Math.max(0, Math.floor(startIndex));
  const normalizedEndIndex = Math.max(normalizedStartIndex, Math.floor(endIndex));
  const mergedSegments = [{ start: normalizedStartIndex, end: normalizedEndIndex }, ...pinnedIndexes.map((index) => ({ start: index, end: index }))]
    .sort((left, right) => left.start - right.start)
    .reduce<TaskListVirtualizerSegment[]>((segments, segment) => {
      const previous = segments[segments.length - 1];
      if (!previous) {
        segments.push(segment);
        return segments;
      }

      if (segment.start <= previous.end + 1) {
        previous.end = Math.max(previous.end, segment.end);
        return segments;
      }

      segments.push(segment);
      return segments;
    }, []);

  return mergedSegments;
}

export function flattenTaskListVirtualizerSegments(segments: readonly TaskListVirtualizerSegment[]) {
  return segments.flatMap((segment) => {
    const indexes: number[] = [];
    for (let index = segment.start; index <= segment.end; index += 1) {
      indexes.push(index);
    }
    return indexes;
  });
}

export function buildTaskListVirtualizerRangeExtractor(pinnedIndexes: readonly number[]) {
  const pinnedIndexSet = new Set(pinnedIndexes.filter((index) => Number.isInteger(index) && index >= 0));

  return (range: TaskListVirtualizerRange) => {
    const visibleIndexes = defaultRangeExtractor(range);
    const merged = new Set<number>(visibleIndexes);
    for (const index of pinnedIndexSet) {
      merged.add(index);
    }
    return [...merged].sort((left, right) => left - right);
  };
}

export function buildTaskListVirtualizerVisibleIndexes(
  startIndex: number,
  endIndex: number,
  pinnedIndexes: readonly number[],
) {
  return flattenTaskListVirtualizerSegments(mergePinnedIndexesWithVisibleRange(startIndex, endIndex, pinnedIndexes));
}
