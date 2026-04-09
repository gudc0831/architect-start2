"use client";

import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import clsx from "clsx";

import {
  setTaskQuickCreateFormField,
  resetTaskQuickCreateFormAction,
  useTaskQuickCreateFormState,
  type TaskQuickCreateFormFieldKey,
  type TaskQuickCreateFormValues,
} from "@/components/tasks/task-quick-create-state";

type TaskQuickCreateProps = {
  initialValues: TaskQuickCreateFormValues;
  isOpen: boolean;
  canCollapse: boolean;
  composerMode: "strip" | "wrapped" | "stacked";
  onToggleOpen: () => void;
  onClose: () => void;
  onSubmit: (values: TaskQuickCreateFormValues) => Promise<boolean> | boolean;
  renderFields: (
    values: TaskQuickCreateFormValues,
    onChange: <K extends TaskQuickCreateFormFieldKey>(key: K, value: TaskQuickCreateFormValues[K]) => void,
  ) => ReactNode;
  copy: {
    eyebrow: string;
    title: string;
    body: string;
    hideLabel: string;
    showLabel: string;
    createLabel: string;
    keepListVisibleLabel: string;
  };
};

export const TaskQuickCreate = memo(function TaskQuickCreate({
  initialValues,
  isOpen,
  canCollapse,
  composerMode,
  onToggleOpen,
  onClose,
  onSubmit,
  renderFields,
  copy,
}: TaskQuickCreateProps) {
  const [state, dispatch] = useTaskQuickCreateFormState(initialValues);

  const updateField = useCallback(
    <K extends TaskQuickCreateFormFieldKey>(key: K, value: TaskQuickCreateFormValues[K]) => {
      dispatch(setTaskQuickCreateFormField(key, value));
    },
    [dispatch],
  );

  const handleSubmit = useCallback(async () => {
    const didCreate = await onSubmit(state.values);
    if (!didCreate) {
      return;
    }

    dispatch(resetTaskQuickCreateFormAction());
  }, [dispatch, onSubmit, state.values]);

  return (
    <section className="composer-card">
      <div className="composer-card__header">
        <div>
          <p className="workspace__eyebrow">{copy.eyebrow}</p>
          <h3>{copy.title}</h3>
          <p className="workspace__meta">{copy.body}</p>
        </div>
        {canCollapse ? (
          <button className="secondary-button composer-card__toggle" onClick={onToggleOpen} type="button">
            {isOpen ? copy.hideLabel : copy.showLabel}
          </button>
        ) : null}
      </div>
      {isOpen ? (
        <div className="composer-card__body">
          <div className={clsx("composer-scroll-view", composerMode !== "strip" && "composer-scroll-view--wrapped")}>
            {renderFields(state.values, updateField)}
          </div>
          <div className="detail-actions detail-actions--inline">
            <button className="primary-button" onClick={() => void handleSubmit()} type="button">
              {copy.createLabel}
            </button>
            {canCollapse ? (
              <button className="secondary-button" onClick={onClose} type="button">
                {copy.keepListVisibleLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
});
