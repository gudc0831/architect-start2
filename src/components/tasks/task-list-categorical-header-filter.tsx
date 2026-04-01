"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { t } from "@/lib/ui-copy";

type TaskListCategoricalHeaderFilterProps = {
  fieldLabel: string;
  isActive: boolean;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onReset: () => void;
  onSelectAll: () => void;
  onToggleOpen: () => void;
  onToggleValue: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  selectedCountLabel: string;
  selectedValues: readonly string[];
  triggerSummaryLabel: string;
};

export function TaskListCategoricalHeaderFilter({
  fieldLabel,
  isActive,
  isOpen,
  onCancel,
  onConfirm,
  onReset,
  onSelectAll,
  onToggleOpen,
  onToggleValue,
  options,
  selectedCountLabel,
  selectedValues,
  triggerSummaryLabel,
}: TaskListCategoricalHeaderFilterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePopoverPosition() {
      const triggerBounds = triggerRef.current?.getBoundingClientRect();
      if (!triggerBounds) {
        setPopoverStyle(null);
        return;
      }

      const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 252;
      const safeEdge = 12;
      const gap = 6;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(triggerBounds.width, 248), viewportWidth - safeEdge * 2);
      const left = Math.max(safeEdge, Math.min(triggerBounds.right - width, viewportWidth - width - safeEdge));
      const spaceBelow = viewportHeight - triggerBounds.bottom - safeEdge;
      const spaceAbove = triggerBounds.top - safeEdge;
      const openAbove = spaceBelow < Math.min(popoverHeight, 240) && spaceAbove > spaceBelow;
      const availableHeight = Math.max(176, (openAbove ? spaceAbove : spaceBelow) - gap);
      const anchoredHeight = Math.min(popoverHeight, availableHeight);
      const top = openAbove
        ? Math.max(safeEdge, triggerBounds.top - anchoredHeight - gap)
        : Math.min(viewportHeight - anchoredHeight - safeEdge, triggerBounds.bottom + gap);

      setPopoverStyle({
        left,
        maxHeight: availableHeight,
        position: "fixed",
        top,
        width,
      });
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, options.length]);

  const popover = isOpen
    ? createPortal(
        <div className="sheet-table__filter-layer" data-task-portal-interaction="true" role="presentation">
          <div className="sheet-table__filter-backdrop" onPointerDown={handleBackdropPointerDown} role="presentation" />
          <div
            aria-label={fieldLabel}
            aria-modal="false"
            className="sheet-table__filter-popover"
            data-task-portal-interaction="true"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            ref={popoverRef}
            role="dialog"
            style={popoverStyle ?? { position: "fixed", visibility: "hidden" }}
          >
            <div className="sheet-table__filter-toolbar">
              <div className="sheet-table__filter-utility">
                <button className="sheet-table__filter-link" onClick={onSelectAll} type="button">
                  {t("actions.selectAll")}
                </button>
                <span aria-hidden="true" className="sheet-table__filter-link-separator">
                  |
                </span>
                <button className="sheet-table__filter-link" onClick={onReset} type="button">
                  {t("workspace.resetFilter")}
                </button>
              </div>
              <span className="sheet-table__filter-count">{selectedCountLabel}</span>
            </div>
            <div aria-label={fieldLabel} className="sheet-table__filter-options" role="group">
              {options.map((option) => (
                <label className="sheet-table__filter-option" key={option.value || "__empty__"}>
                  <input
                    checked={selectedValues.includes(option.value)}
                    onChange={() => onToggleValue(option.value)}
                    type="checkbox"
                  />
                  <span className="sheet-table__filter-option-label">{option.label}</span>
                </label>
              ))}
            </div>
            <div className="sheet-table__filter-footer">
              <button
                className="sheet-table__filter-footer-button sheet-table__filter-footer-button--secondary"
                onClick={onCancel}
                type="button"
              >
                {t("actions.cancel")}
              </button>
              <button
                className="sheet-table__filter-footer-button sheet-table__filter-footer-button--primary"
                onClick={onConfirm}
                type="button"
              >
                {t("actions.confirm")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="sheet-table__head-controls" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={t("workspace.headerFilterAria", { field: fieldLabel, label: triggerSummaryLabel })}
        className={clsx("sheet-table__filter-trigger", isActive && "sheet-table__filter-trigger--active")}
        disabled={options.length === 0}
        onClick={() => {
          if (!isOpen) {
            setPopoverStyle(null);
          }
          onToggleOpen();
        }}
        ref={triggerRef}
        type="button"
      />
      {popover}
    </div>
  );
}
