"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import clsx from "clsx";

import { dailyTaskListColumns, type DailyTaskListColumnConfig } from "@/domains/task/daily-list";
import type { TaskListColumnKey } from "@/domains/preferences/types";
import { labelForField } from "@/lib/ui-copy";

type DailyGridHeaderV2Props = {
  gridTemplateColumns: string;
  totalWidth: number;
  renderHeaderControl: (column: DailyTaskListColumnConfig) => ReactNode;
  onColumnResizeStart: (columnKey: TaskListColumnKey, event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function DailyGridHeaderV2({
  gridTemplateColumns,
  totalWidth,
  renderHeaderControl,
  onColumnResizeStart,
}: DailyGridHeaderV2Props) {
  return (
    <div
      className="daily-grid-v2__header"
      data-task-grid-interaction="true"
      role="row"
      style={{
        gridTemplateColumns,
        minWidth: `${totalWidth}px`,
        width: `${totalWidth}px`,
      }}
    >
      {dailyTaskListColumns.map((column) => (
        <div
          className={clsx("daily-grid-v2__header-cell", column.className)}
          data-grid-column={column.key}
          data-task-column={column.key}
          key={column.key}
          role="columnheader"
        >
          <div className="sheet-table__head-inner">
            <span className="sheet-table__head-label">{labelForField(column.key)}</span>
            {renderHeaderControl(column)}
            <button
              aria-label={labelForField(column.key)}
              className="sheet-table__column-resize-handle"
              onPointerDown={(event) => onColumnResizeStart(column.key, event)}
              type="button"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
