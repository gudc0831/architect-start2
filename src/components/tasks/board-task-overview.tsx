"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import type { TaskStatus } from "@/domains/task/types";
import { labelForStatus } from "@/lib/ui-copy";
import { TaskFocusStrip, type TaskFocusStripItem } from "@/components/tasks/task-focus-strip";

export type BoardSummaryCard = {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  tone?: "neutral" | "accent" | "warn";
};

export type BoardTaskCard = {
  id: string;
  displayId: string;
  title: string;
  description?: ReactNode;
  dueDateLabel: ReactNode;
  workTypeLabel: ReactNode;
  assigneeLabel: ReactNode;
  fileCountLabel: ReactNode;
  status: TaskStatus;
  statusLabel?: string;
  isActive?: boolean;
  className?: string;
  stateClassName?: string;
  urgencyClassName?: string;
  badgeClassName?: string;
  secondaryBadge?: ReactNode;
  actions?: ReactNode;
};

export type BoardTaskGroup = {
  status: TaskStatus;
  label: string;
  description: ReactNode;
  items: readonly BoardTaskCard[];
  className?: string;
  emptyLabel: ReactNode;
  countLabel?: ReactNode;
};

export type BoardTaskOverviewProps = {
  summaryCards: readonly BoardSummaryCard[];
  focusStrip?: {
    items: readonly TaskFocusStripItem[];
    activeKey: string | null;
    onSelect: (key: string) => void;
    className?: string;
    ariaLabel?: string;
    title?: ReactNode;
    description?: ReactNode;
  };
  groups: readonly BoardTaskGroup[];
  className?: string;
  metaLabels?: {
    dueDate: ReactNode;
    fileCount: ReactNode;
    workType: ReactNode;
    assignee: ReactNode;
  };
  onTaskSelect?: (taskId: string) => void;
  renderTaskActions?: (task: BoardTaskCard) => ReactNode;
  renderTaskMeta?: (task: BoardTaskCard) => ReactNode;
  statusLabels?: Partial<Record<TaskStatus, string>>;
};

export function BoardTaskOverview({
  summaryCards,
  focusStrip,
  groups,
  className,
  metaLabels,
  onTaskSelect,
  renderTaskActions,
  renderTaskMeta,
  statusLabels,
}: BoardTaskOverviewProps) {
  return (
    <div className={clsx("board-task-overview", className)}>
      <section aria-label="Board summary" className="board-summary board-task-overview__summary">
        {summaryCards.map((card) => (
          <article className={clsx("board-summary__card", card.className, card.tone && `board-summary__card--${card.tone}`)} key={card.key}>
            <span className="board-summary__label">{card.label}</span>
            <strong className="board-summary__value">{card.value}</strong>
            {card.hint ? <span className="board-summary__hint">{card.hint}</span> : null}
          </article>
        ))}
      </section>

      {focusStrip ? (
        <section aria-label={focusStrip.ariaLabel ?? "Task focus strip"} className={clsx("board-focus", focusStrip.className)}>
          {focusStrip.title || focusStrip.description ? (
            <div className="board-focus__header">
              {focusStrip.title ? <h3 className="board-focus__title">{focusStrip.title}</h3> : null}
              {focusStrip.description ? <p className="board-focus__description">{focusStrip.description}</p> : null}
            </div>
          ) : null}
          <TaskFocusStrip
            activeKey={focusStrip.activeKey}
            ariaLabel={focusStrip.ariaLabel}
            className="board-focus__strip"
            items={focusStrip.items}
            onSelect={focusStrip.onSelect}
          />
        </section>
      ) : null}

      <div className="board-columns board-task-overview__columns">
        {groups.map((group) => (
          <section className={clsx("board-column", group.className, `task-state--${group.status}`)} key={group.status}>
            <header className="board-column__header">
              <div className="board-column__header-copy">
                <h3>{group.label}</h3>
                <p>{group.description}</p>
              </div>
              <span className={clsx("status-pill", `status-pill--${group.status}`)}>{group.countLabel ?? group.items.length}</span>
            </header>

            <div className="board-column__items">
              {group.items.length === 0 ? <div className="board-column__empty">{group.emptyLabel}</div> : null}
              {group.items.map((task) => {
                const taskStatusLabel = task.statusLabel ?? statusLabels?.[task.status] ?? labelForStatus(task.status);
                const actions = task.actions ?? renderTaskActions?.(task);
                const meta = renderTaskMeta?.(task);

                return (
                  <article
                    className={clsx(
                      "task-card",
                      task.className,
                      task.stateClassName,
                      task.urgencyClassName,
                      task.isActive && "task-card--active",
                      task.isActive && "task-state--selected",
                    )}
                    data-status={task.status}
                    key={task.id}
                    onClick={() => onTaskSelect?.(task.id)}
                    onKeyDown={(event) => {
                      if (!onTaskSelect) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onTaskSelect(task.id);
                      }
                    }}
                    role={onTaskSelect ? "button" : undefined}
                    tabIndex={onTaskSelect ? 0 : undefined}
                  >
                    <div className="task-card__top">
                      <strong className="task-card__id">{task.displayId}</strong>
                      <span className={clsx("status-pill", `status-pill--${task.status}`, task.badgeClassName)}>{taskStatusLabel}</span>
                    </div>

                    <div className="task-card__main">
                      <h4>{task.title}</h4>
                      <p className="task-card__description">{task.description ?? ""}</p>
                    </div>

                    <dl className="task-card__meta">
                      <div className="task-card__meta-item">
                        <dt>{metaLabels?.dueDate ?? "Due date"}</dt>
                        <dd>{task.dueDateLabel}</dd>
                      </div>
                      <div className="task-card__meta-item">
                        <dt>{metaLabels?.fileCount ?? "Files"}</dt>
                        <dd>{task.fileCountLabel}</dd>
                      </div>
                      <div className="task-card__meta-item">
                        <dt>{metaLabels?.workType ?? "Work type"}</dt>
                        <dd>{task.workTypeLabel}</dd>
                      </div>
                      <div className="task-card__meta-item">
                        <dt>{metaLabels?.assignee ?? "Assignee"}</dt>
                        <dd>{task.assigneeLabel}</dd>
                      </div>
                      {meta ? <div className="task-card__meta-item task-card__meta-item--wide">{meta}</div> : null}
                    </dl>

                    {actions ? <div className="task-card__actions">{actions}</div> : null}
                    {task.secondaryBadge ? <div className="task-card__secondary-badge">{task.secondaryBadge}</div> : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
