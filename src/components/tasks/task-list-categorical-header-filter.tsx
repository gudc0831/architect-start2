"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { t } from "@/lib/ui-copy";

type TaskListCategoricalHeaderFilterProps = {
  buttonLabel: string;
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
};

export function TaskListCategoricalHeaderFilter({
  buttonLabel,
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
}: TaskListCategoricalHeaderFilterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentPointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      onCancel();
    }

    function handleDocumentFocusIn(event: FocusEvent) {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      onCancel();
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("mousedown", handleDocumentPointerDown, true);
    document.addEventListener("touchstart", handleDocumentPointerDown, true);
    document.addEventListener("focusin", handleDocumentFocusIn);
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown, true);
      document.removeEventListener("touchstart", handleDocumentPointerDown, true);
      document.removeEventListener("focusin", handleDocumentFocusIn);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isOpen, onCancel]);

  return (
    <div className="sheet-table__head-controls" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={t("workspace.headerFilterAria", { field: fieldLabel, label: buttonLabel })}
        className={clsx("sheet-table__filter-trigger", isActive && "sheet-table__filter-trigger--active")}
        disabled={options.length === 0}
        onClick={onToggleOpen}
        type="button"
      >
        <span className="sheet-table__filter-trigger-label">{buttonLabel}</span>
      </button>
      {isOpen ? (
        <div aria-label={fieldLabel} aria-modal="false" className="sheet-table__filter-popover" role="dialog">
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
      ) : null}
    </div>
  );
}
