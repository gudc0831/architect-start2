"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import type { TaskStatus } from "@/domains/task/types";
import { TaskFocusStrip, type TaskFocusStripItem } from "@/components/tasks/task-focus-strip";
import { TaskPreviewCard, type TaskPreviewCardProps } from "@/components/tasks/task-preview-card";

export type BoardSummaryCard = {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  tone?: "neutral" | "accent" | "warn";
};

export type BoardTaskCard = Omit<TaskPreviewCardProps, "href" | "interactionMode" | "showStatusPill" | "variant">;

export type BoardTaskGroup = {
  status: TaskStatus;
  label: string;
  description: ReactNode;
  items: readonly BoardTaskCard[];
  className?: string;
  emptyLabel: ReactNode;
  countLabel?: ReactNode;
  isCollapsed?: boolean;
  toggleLabel?: ReactNode;
  toggleAriaLabel?: string;
  onToggleCollapse?: (status: TaskStatus) => void;
  page?: number;
  pageCount?: number;
  pageLabel?: ReactNode;
  previousPageLabel?: ReactNode;
  nextPageLabel?: ReactNode;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  onPrevPage?: (status: TaskStatus) => void;
  onNextPage?: (status: TaskStatus) => void;
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
};

export function BoardTaskOverview({ summaryCards, focusStrip, groups, className }: BoardTaskOverviewProps) {
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
          <section
            className={clsx(
              "board-column",
              group.className,
              `task-state--${group.status}`,
              group.isCollapsed && "board-column--collapsed",
            )}
            key={group.status}
          >
            <header className="board-column__header">
              <span aria-hidden="true" className={clsx("board-column__status-bar", `board-column__status-bar--${group.status}`)} />
              <div className="board-column__header-main">
                <div className="board-column__header-copy">
                  <div className="board-column__header-topline">
                    <h3>{group.label}</h3>
                    <span className={clsx("status-pill", `status-pill--${group.status}`)}>{group.countLabel ?? group.items.length}</span>
                  </div>
                  <p>{group.description}</p>
                </div>
                {group.onToggleCollapse ? (
                  <button
                    aria-expanded={!group.isCollapsed}
                    aria-label={group.toggleAriaLabel}
                    className="board-column__icon-button"
                    onClick={() => group.onToggleCollapse?.(group.status)}
                    type="button"
                  >
                    <span aria-hidden="true" className="board-column__icon-mark">
                      {group.isCollapsed ? "+" : "-"}
                    </span>
                  </button>
                ) : null}
              </div>
            </header>

            {group.isCollapsed ? null : (
              <>
                <div className="board-column__body">
                  <div className="board-column__items">
                    {group.items.length === 0 ? <div className="board-column__empty">{group.emptyLabel}</div> : null}
                    {group.items.map((task) => (
                      <TaskPreviewCard
                        {...task}
                        interactionMode="expandable"
                        key={task.id}
                        showStatusPill={false}
                        variant="board"
                      />
                    ))}
                  </div>
                </div>

                {group.pageCount && group.pageCount > 1 ? (
                  <footer className="board-column__footer">
                    <button
                      className="secondary-button board-column__page-button"
                      disabled={!group.canGoPrev}
                      onClick={() => group.onPrevPage?.(group.status)}
                      type="button"
                    >
                      {group.previousPageLabel}
                    </button>
                    <span className="board-column__page-label">{group.pageLabel}</span>
                    <button
                      className="secondary-button board-column__page-button"
                      disabled={!group.canGoNext}
                      onClick={() => group.onNextPage?.(group.status)}
                      type="button"
                    >
                      {group.nextPageLabel}
                    </button>
                  </footer>
                ) : null}
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
