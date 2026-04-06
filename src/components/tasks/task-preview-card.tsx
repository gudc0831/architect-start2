"use client";

import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import type { TaskStatus } from "@/domains/task/types";
import { labelForStatus } from "@/lib/ui-copy";

export type TaskPreviewCardDeadlineTone = "warn" | "accent" | "neutral";
export type TaskPreviewCardInteractionMode = "navigate-only" | "expandable";
export type TaskPreviewCardVariant = "board" | "calendar-month" | "calendar-agenda";

export type TaskPreviewCardProps = {
  id: string;
  title: ReactNode;
  status: TaskStatus;
  dueDateLabel: ReactNode;
  deadlineTone?: TaskPreviewCardDeadlineTone | null;
  deadlineLabel?: ReactNode;
  detailNote?: ReactNode;
  metaLine?: ReactNode;
  taskNumber?: ReactNode;
  href?: Route;
  interactionMode?: TaskPreviewCardInteractionMode;
  variant?: TaskPreviewCardVariant;
  className?: string;
  isExpanded?: boolean;
  isDimmed?: boolean;
  showStatusPill?: boolean;
  actions?: ReactNode;
  toggleLabel?: ReactNode;
  toggleAriaLabel?: string;
  onToggleExpand?: (taskId: string) => void;
};

export function TaskPreviewCard({
  id,
  title,
  status,
  dueDateLabel,
  deadlineTone,
  deadlineLabel,
  detailNote,
  metaLine,
  taskNumber,
  href,
  interactionMode = "navigate-only",
  variant = "board",
  className,
  isExpanded,
  isDimmed,
  showStatusPill,
  actions,
  toggleLabel,
  toggleAriaLabel,
  onToggleExpand,
}: TaskPreviewCardProps) {
  const shouldShowStatusPill = showStatusPill ?? variant !== "board";
  const canToggleExpand = interactionMode === "expandable" && Boolean(onToggleExpand);
  const cardClassName = clsx(
    "task-card",
    "task-preview-card",
    `task-preview-card--${variant}`,
    `task-preview-card--${interactionMode}`,
    className,
    isExpanded && "task-card--expanded",
    isDimmed && "task-state-card--dimmed",
  );

  const deadlineBadge =
    deadlineLabel && deadlineTone ? (
      <span className={clsx("task-state__deadline-badge", `task-state__deadline-badge--${deadlineTone}`)}>{deadlineLabel}</span>
    ) : null;

  const content = (
    <>
      {taskNumber || shouldShowStatusPill ? (
        <div className="task-preview-card__badges">
          {taskNumber ? <span className="task-preview-card__number">{taskNumber}</span> : null}
          {shouldShowStatusPill ? <span className={clsx("status-pill", `status-pill--${status}`)}>{labelForStatus(status)}</span> : null}
        </div>
      ) : null}

      <div className="task-card__summary">
        <div className="task-card__header-row">
          <h4 className="task-card__title">{title}</h4>
        </div>
        {metaLine ? <p className="task-preview-card__meta-line">{metaLine}</p> : null}
        <div className="task-card__meta-inline">
          <span className="task-card__due">{dueDateLabel}</span>
          {deadlineBadge}
          {canToggleExpand ? (
            <button
              aria-expanded={isExpanded}
              aria-label={toggleAriaLabel}
              className="task-card__toggle"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleExpand?.(id);
              }}
              type="button"
            >
              {toggleLabel}
            </button>
          ) : null}
        </div>
      </div>

      {interactionMode === "expandable" && isExpanded ? (
        <div className="task-card__details">
          {detailNote ? <p className="task-card__description">{detailNote}</p> : null}
          {actions ? <div className="task-card__actions">{actions}</div> : null}
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link className={cardClassName} data-status={status} href={href}>
        {content}
      </Link>
    );
  }

  return (
    <article className={cardClassName} data-status={status}>
      {content}
    </article>
  );
}
