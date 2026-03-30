import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
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
  fieldKey: Exclude<TaskCategoricalFieldKey, "relatedDisciplines">;
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
  fieldKey: "relatedDisciplines";
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
  const summaryLabel = labelForTaskCategoricalFieldValue(fieldKey, value, context);

  useEffect(() => {
    setDraftValues(selectedValues);
  }, [selectedValues]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentPointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setDraftValues(selectedValues);
      setIsOpen(false);
      onCancel?.();
    }

    function handleDocumentFocusIn(event: FocusEvent) {
      if (containerRef.current?.contains(event.target as Node)) {
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

  const orderedDraftValues = options
    .map((option) => option.value)
    .filter((optionValue) => draftValues.includes(optionValue));
  const containerClassName = ["task-categorical-multiselect", className].filter(Boolean).join(" ");
  const triggerClassName = ["task-categorical-multiselect__trigger", buttonClassName].filter(Boolean).join(" ");

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
        {summaryLabel}
      </button>
      {isOpen ? (
        <div aria-label={labelForField(fieldKey)} aria-modal="false" className="sheet-table__filter-popover" role="dialog">
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
        </div>
      ) : null}
    </div>
  );
}

export { serializeTaskCategoryValues };
