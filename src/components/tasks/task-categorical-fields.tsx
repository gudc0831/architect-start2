import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import {
  getTaskCategoricalFilterOptions as getTaskCategoricalFieldOptionsInternal,
  getTaskCategoricalFilterValue as getTaskCategoricalFieldValueInternal,
  getTaskCategoricalFilterValues as getTaskCategoricalFieldValuesInternal,
  labelForTaskCategoricalFilterValue as labelForTaskCategoricalFieldValueInternal,
  serializeTaskCategoryValues,
  type TaskCategoricalFilterContext,
  type TaskCategoricalFilterFieldKey,
  type TaskCategoricalFilterOption,
} from "@/lib/task-categorical-filter";
import { labelForField, t } from "@/lib/ui-copy";

export type TaskCategoricalFieldKey = TaskCategoricalFilterFieldKey;
export type TaskCategoricalFieldOption = TaskCategoricalFilterOption;

type TaskCategoryDefinitionLike = Pick<TaskCategoryDefinition, "fieldKey" | "code" | "labelKo" | "isActive" | "sortOrder">;
type TaskCategoricalFieldContext = TaskCategoricalFilterContext & {
  workTypeDefinitions?: readonly Pick<TaskCategoryDefinitionLike, "code" | "labelKo" | "isActive" | "sortOrder">[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinitionLike[]>>;
};

export function getTaskCategoricalFieldOptions(
  fieldKey: TaskCategoricalFieldKey,
  context: TaskCategoricalFieldContext = {},
  value?: string | null,
) {
  void value;
  return getTaskCategoricalFieldOptionsInternal(fieldKey, context);
}

export function getTaskCategoricalFieldValue(
  fieldKey: TaskCategoricalFieldKey,
  value: unknown,
  context: TaskCategoricalFieldContext = {},
) {
  return getTaskCategoricalFieldValueInternal(fieldKey, value, context);
}

export function getTaskCategoricalFieldValues(
  fieldKey: Exclude<TaskCategoricalFieldKey, "status">,
  value: unknown,
  context: TaskCategoricalFieldContext = {},
) {
  return getTaskCategoricalFieldValuesInternal(fieldKey, value, context);
}

export function labelForTaskCategoricalFieldValue(
  fieldKey: TaskCategoricalFieldKey,
  value: unknown,
  context: TaskCategoricalFieldContext = {},
) {
  return labelForTaskCategoricalFieldValueInternal(fieldKey, value, context);
}

type TaskCategoricalFieldSelectProps = Omit<ComponentPropsWithoutRef<"select">, "children" | "value"> & {
  fieldKey: Exclude<TaskCategoricalFieldKey, "relatedDisciplines" | "locationRef">;
  value: string | null | undefined;
  workTypeDefinitions?: readonly Pick<TaskCategoryDefinitionLike, "code" | "labelKo" | "isActive" | "sortOrder">[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinitionLike[]>>;
};

export function TaskCategoricalFieldSelect({
  fieldKey,
  value,
  workTypeDefinitions,
  categoryDefinitionsByField,
  disabled,
  ...props
}: TaskCategoricalFieldSelectProps) {
  const context = { workTypeDefinitions, categoryDefinitionsByField };
  const options = getTaskCategoricalFieldOptions(fieldKey, context, value);
  const selectedValue = getTaskCategoricalFieldValue(fieldKey, value, context);
  const hasSelectableOptions = fieldKey === "status" || options.some((option) => option.value);

  return (
    <select {...props} disabled={disabled || !hasSelectableOptions} value={selectedValue}>
      {options.map((option) => (
        <option key={option.value || "__empty__"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type TaskCategoricalFieldMultiSelectProps = Omit<ComponentPropsWithoutRef<"button">, "children" | "onChange" | "value"> & {
  fieldKey: "relatedDisciplines" | "locationRef";
  value: unknown;
  onChangeValues: (values: string[]) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  workTypeDefinitions?: readonly Pick<TaskCategoryDefinitionLike, "code" | "labelKo" | "isActive" | "sortOrder">[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinitionLike[]>>;
  buttonClassName?: string;
  disabled?: boolean;
};

export function TaskCategoricalFieldMultiSelect({
  fieldKey,
  value,
  onChangeValues,
  onConfirm,
  onCancel,
  workTypeDefinitions,
  categoryDefinitionsByField,
  buttonClassName,
  className,
  disabled = false,
  ...props
}: TaskCategoricalFieldMultiSelectProps) {
  const context = { workTypeDefinitions, categoryDefinitionsByField };
  const allOptions = useMemo(
    () => getTaskCategoricalFieldOptions(fieldKey, context),
    [context.categoryDefinitionsByField, context.workTypeDefinitions, fieldKey],
  );
  const options = useMemo(() => allOptions.filter((option) => option.value), [allOptions]);
  const selectedValues = useMemo(
    () => getTaskCategoricalFieldValues(fieldKey, value, context),
    [context.categoryDefinitionsByField, context.workTypeDefinitions, fieldKey, value],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [draftValues, setDraftValues] = useState<string[]>(selectedValues);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const summaryLabel = useMemo(() => {
    if (selectedValues.length === 0) {
      return labelForTaskCategoricalFieldValue(fieldKey, value, context);
    }

    if (selectedValues.length === 1) {
      return options.find((option) => option.value === selectedValues[0])?.label ?? selectedValues[0];
    }

    return t("workspace.selectedCount", { count: selectedValues.length });
  }, [context, fieldKey, options, selectedValues, value]);

  useEffect(() => {
    setDraftValues(selectedValues);
  }, [selectedValues]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentPointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current?.contains(event.target as Node) || popoverRef.current?.contains(event.target as Node)) {
        return;
      }

      setDraftValues(selectedValues);
      setIsOpen(false);
      onCancel?.();
    }

    function handleDocumentFocusIn(event: FocusEvent) {
      if (containerRef.current?.contains(event.target as Node) || popoverRef.current?.contains(event.target as Node)) {
        return;
      }

      setDraftValues(selectedValues);
      setIsOpen(false);
      onCancel?.();
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDraftValues(selectedValues);
        setIsOpen(false);
        onCancel?.();
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
  }, [isOpen, onCancel, selectedValues]);

  useEffect(() => {
    if (!isOpen) {
      setPopoverStyle(null);
      return;
    }

    function updatePopoverPosition() {
      const triggerBounds = triggerRef.current?.getBoundingClientRect();
      if (!triggerBounds) {
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

  const orderedDraftValues = options
    .map((option) => option.value)
    .filter((optionValue) => draftValues.includes(optionValue));
  const containerClassName = ["task-categorical-multiselect", className].filter(Boolean).join(" ");
  const triggerClassName = ["task-categorical-multiselect__trigger", buttonClassName].filter(Boolean).join(" ");
  const popover = isOpen
    ? createPortal(
        <div
          aria-label={labelForField(fieldKey)}
          aria-modal="false"
          className="sheet-table__filter-popover task-categorical-multiselect__popover"
          data-task-portal-interaction="true"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          ref={popoverRef}
          role="dialog"
          style={popoverStyle ?? { position: "fixed", visibility: "hidden" }}
        >
          <div className="sheet-table__filter-toolbar">
            <div className="sheet-table__filter-utility">
              <button
                className="sheet-table__filter-link"
                onClick={() => setDraftValues(options.map((option) => option.value))}
                type="button"
              >
                {t("actions.selectAll")}
              </button>
              <span aria-hidden="true" className="sheet-table__filter-link-separator">
                |
              </span>
              <button className="sheet-table__filter-link" onClick={() => setDraftValues([])} type="button">
                {t("workspace.resetFilter")}
              </button>
            </div>
            <span className="sheet-table__filter-count">
              {t("workspace.selectedCount", { count: orderedDraftValues.length })}
            </span>
          </div>
          <div aria-label={labelForField(fieldKey)} className="sheet-table__filter-options" role="group">
            {options.map((option) => (
              <label className="sheet-table__filter-option" key={option.value}>
                <input
                  checked={draftValues.includes(option.value)}
                  onChange={() => {
                    setDraftValues((previous) => {
                      const next = new Set(previous);
                      if (next.has(option.value)) {
                        next.delete(option.value);
                      } else {
                        next.add(option.value);
                      }

                      return options.map((entry) => entry.value).filter((entry) => next.has(entry));
                    });
                  }}
                  type="checkbox"
                />
                <span className="sheet-table__filter-option-label">{option.label}</span>
              </label>
            ))}
          </div>
          <div className="sheet-table__filter-footer">
            <button
              className="sheet-table__filter-footer-button sheet-table__filter-footer-button--secondary"
              onClick={() => {
                setDraftValues(selectedValues);
                setIsOpen(false);
                onCancel?.();
              }}
              type="button"
            >
              {t("actions.cancel")}
            </button>
            <button
              className="sheet-table__filter-footer-button sheet-table__filter-footer-button--primary"
              onClick={() => {
                onChangeValues(orderedDraftValues);
                setIsOpen(false);
                onConfirm?.();
              }}
              type="button"
            >
              {t("actions.confirm")}
            </button>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      className={containerClassName}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={containerRef}
    >
      <button
        {...props}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={triggerClassName}
        data-task-multiselect-trigger="true"
        disabled={disabled || options.length === 0}
        ref={triggerRef}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled || options.length === 0) {
            return;
          }

          setDraftValues(selectedValues);
          setIsOpen((previous) => !previous);
        }}
        type="button"
      >
        <span className="task-categorical-multiselect__trigger-label">{summaryLabel}</span>
      </button>
      {popover}
    </div>
  );
}

export { serializeTaskCategoryValues };
