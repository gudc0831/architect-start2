"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

type TaskListOrderHeaderMenuAction = {
  description?: string;
  disabled?: boolean;
  key: string;
  label: string;
  onSelect: () => void;
};

type TaskListOrderHeaderMenuProps = {
  actions: readonly TaskListOrderHeaderMenuAction[];
  auxiliaryToggleChecked?: boolean;
  auxiliaryToggleLabel?: string;
  ariaLabel: string;
  isBusy?: boolean;
  isOpen: boolean;
  modeLabel: string;
  onClose: () => void;
  onToggleAuxiliaryToggle?: () => void;
  onToggleOpen: () => void;
};

export function TaskListOrderHeaderMenu({
  actions,
  auxiliaryToggleChecked = false,
  auxiliaryToggleLabel,
  ariaLabel,
  isBusy = false,
  isOpen,
  modeLabel,
  onClose,
  onToggleAuxiliaryToggle,
  onToggleOpen,
}: TaskListOrderHeaderMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isOpen, onClose]);

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

      const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 196;
      const safeEdge = 12;
      const gap = 6;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(triggerBounds.width + 84, 220), viewportWidth - safeEdge * 2);
      const left = Math.max(safeEdge, Math.min(triggerBounds.right - width, viewportWidth - width - safeEdge));
      const spaceBelow = viewportHeight - triggerBounds.bottom - safeEdge;
      const spaceAbove = triggerBounds.top - safeEdge;
      const openAbove = spaceBelow < Math.min(popoverHeight, 200) && spaceAbove > spaceBelow;
      const availableHeight = Math.max(160, (openAbove ? spaceAbove : spaceBelow) - gap);
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
  }, [isOpen]);

  const popover = isOpen
    ? createPortal(
        <div className="sheet-table__filter-layer" data-task-portal-interaction="true" role="presentation">
          <div className="sheet-table__filter-backdrop" onPointerDown={handleBackdropPointerDown} role="presentation" />
          <div
            aria-label={ariaLabel}
            aria-modal="false"
            className="sheet-table__order-popover"
            data-task-portal-interaction="true"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            ref={popoverRef}
            role="dialog"
            style={popoverStyle ?? { position: "fixed", visibility: "hidden" }}
          >
            <div className="sheet-table__order-popover-list">
              {actions.map((action) => (
                <button
                  className="sheet-table__order-option"
                  disabled={isBusy || action.disabled}
                  key={action.key}
                  onClick={() => {
                    action.onSelect();
                    onClose();
                  }}
                  type="button"
                >
                  <span className="sheet-table__order-option-label">{action.label}</span>
                  {action.description ? (
                    <span className="sheet-table__order-option-description">{action.description}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {auxiliaryToggleLabel && onToggleAuxiliaryToggle ? (
              <div className="sheet-table__order-auxiliary">
                <label className="sheet-table__order-auxiliary-option">
                  <input
                    checked={auxiliaryToggleChecked}
                    disabled={isBusy}
                    onChange={() => onToggleAuxiliaryToggle()}
                    onClick={(event) => event.stopPropagation()}
                    type="checkbox"
                  />
                  <span className="sheet-table__order-auxiliary-label">{auxiliaryToggleLabel}</span>
                </label>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="sheet-table__head-controls">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={clsx("sheet-table__order-trigger", isOpen && "sheet-table__order-trigger--active")}
        onClick={() => {
          if (!isOpen) {
            setPopoverStyle(null);
          }
          onToggleOpen();
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="sheet-table__order-trigger-label">{modeLabel}</span>
        <span aria-hidden="true" className="sheet-table__order-trigger-icon">
          ▾
        </span>
      </button>
      {popover}
    </div>
  );
}
