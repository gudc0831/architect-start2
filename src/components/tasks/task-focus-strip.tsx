"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export type TaskFocusStripTone = "neutral" | "accent" | "warn" | "success";

export type TaskFocusStripItem = {
  key: string;
  label: string;
  hint?: ReactNode;
  count?: ReactNode;
  className?: string;
  tone?: TaskFocusStripTone;
  disabled?: boolean;
};

export type TaskFocusStripProps = {
  items: readonly TaskFocusStripItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  className?: string;
  ariaLabel?: string;
  variant?: "default" | "compact";
};

export function TaskFocusStrip({ items, activeKey, onSelect, className, ariaLabel, variant = "default" }: TaskFocusStripProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={clsx("task-focus-strip", variant === "compact" && "task-focus-strip--compact", className)}
      role="group"
    >
      {items.map((item) => {
        const isActive = item.key === activeKey;

        return (
          <button
            aria-pressed={isActive}
            className={clsx(
              "task-focus-strip__item",
              item.className,
              item.tone && `task-focus-strip__item--${item.tone}`,
              isActive && "task-focus-strip__item--active",
            )}
            disabled={item.disabled}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            <span className="task-focus-strip__label">{item.label}</span>
            {typeof item.count !== "undefined" || item.hint ? (
              <span className="task-focus-strip__meta">
                {typeof item.count !== "undefined" ? <strong className="task-focus-strip__count">{item.count}</strong> : null}
                {item.hint ? <span className="task-focus-strip__hint">{item.hint}</span> : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
