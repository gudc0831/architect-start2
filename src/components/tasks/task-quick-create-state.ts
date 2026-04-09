import { useEffect, useReducer } from "react";
import type { TaskStatus } from "@/domains/task/types";

export type TaskQuickCreateFormValues = {
  actionId: string;
  issueId: string;
  dueDate: string;
  workType: string;
  coordinationScope: string;
  ownerDiscipline: string;
  requestedBy: string;
  relatedDisciplines: string;
  assignee: string;
  issueTitle: string;
  reviewedAt: string;
  updatedAt: string;
  locationRef: string;
  calendarLinked: boolean;
  issueDetailNote: string;
  status: TaskStatus;
  decision: string;
  isDaily: boolean;
};

export type TaskQuickCreateFormFieldKey = keyof TaskQuickCreateFormValues;

export type TaskQuickCreateFormDirtyFields = Partial<Record<TaskQuickCreateFormFieldKey, true>>;

export type TaskQuickCreateFormState = {
  baseline: TaskQuickCreateFormValues;
  values: TaskQuickCreateFormValues;
  dirtyFields: TaskQuickCreateFormDirtyFields;
};

export type TaskQuickCreateFormAction =
  | {
      type: "set-field";
      key: TaskQuickCreateFormFieldKey;
      value: TaskQuickCreateFormValues[TaskQuickCreateFormFieldKey];
    }
  | {
      type: "replace-values";
      values: TaskQuickCreateFormValues;
    }
  | {
      type: "reset";
    }
  | {
      type: "sync-baseline";
      baseline: TaskQuickCreateFormValues;
    };

function cloneTaskQuickCreateFormValues(values: TaskQuickCreateFormValues) {
  return { ...values };
}

export function areTaskQuickCreateFormValuesEqual(
  previous: TaskQuickCreateFormValues,
  next: TaskQuickCreateFormValues,
) {
  const previousKeys = Object.keys(previous) as TaskQuickCreateFormFieldKey[];
  const nextKeys = Object.keys(next) as TaskQuickCreateFormFieldKey[];
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (!Object.is(previous[key], next[key])) {
      return false;
    }
  }

  return true;
}

function buildDirtyFields(
  values: TaskQuickCreateFormValues,
  baseline: TaskQuickCreateFormValues,
): TaskQuickCreateFormDirtyFields {
  const dirtyFields: TaskQuickCreateFormDirtyFields = {};

  (Object.keys(values) as TaskQuickCreateFormFieldKey[]).forEach((key) => {
    if (!Object.is(values[key], baseline[key])) {
      dirtyFields[key] = true;
    }
  });

  return dirtyFields;
}

export function createTaskQuickCreateFormState(
  baseline: TaskQuickCreateFormValues,
): TaskQuickCreateFormState {
  const clonedBaseline = cloneTaskQuickCreateFormValues(baseline);
  return {
    baseline: clonedBaseline,
    values: cloneTaskQuickCreateFormValues(clonedBaseline),
    dirtyFields: {},
  };
}

export function updateTaskQuickCreateFormField<K extends TaskQuickCreateFormFieldKey>(
  state: TaskQuickCreateFormState,
  key: K,
  value: TaskQuickCreateFormValues[K],
): TaskQuickCreateFormState {
  if (Object.is(state.values[key], value)) {
    return state;
  }

  const nextValues = {
    ...state.values,
    [key]: value,
  };

  return {
    baseline: state.baseline,
    values: nextValues,
    dirtyFields: buildDirtyFields(nextValues, state.baseline),
  };
}

export function replaceTaskQuickCreateFormValues(
  state: TaskQuickCreateFormState,
  values: TaskQuickCreateFormValues,
): TaskQuickCreateFormState {
  if (areTaskQuickCreateFormValuesEqual(state.values, values)) {
    return state;
  }

  const nextValues = cloneTaskQuickCreateFormValues(values);
  return {
    baseline: state.baseline,
    values: nextValues,
    dirtyFields: buildDirtyFields(nextValues, state.baseline),
  };
}

export function resetTaskQuickCreateFormState(
  state: TaskQuickCreateFormState,
): TaskQuickCreateFormState {
  if (areTaskQuickCreateFormValuesEqual(state.values, state.baseline) && Object.keys(state.dirtyFields).length === 0) {
    return state;
  }

  const nextValues = cloneTaskQuickCreateFormValues(state.baseline);
  return {
    baseline: state.baseline,
    values: nextValues,
    dirtyFields: {},
  };
}

export function syncTaskQuickCreateFormBaseline(
  state: TaskQuickCreateFormState,
  baseline: TaskQuickCreateFormValues,
): TaskQuickCreateFormState {
  if (areTaskQuickCreateFormValuesEqual(state.baseline, baseline)) {
    return state;
  }

  const nextBaseline = cloneTaskQuickCreateFormValues(baseline);
  return {
    baseline: nextBaseline,
    values: cloneTaskQuickCreateFormValues(nextBaseline),
    dirtyFields: {},
  };
}

export function taskQuickCreateFormReducer(
  state: TaskQuickCreateFormState,
  action: TaskQuickCreateFormAction,
): TaskQuickCreateFormState {
  switch (action.type) {
    case "set-field":
      return updateTaskQuickCreateFormField(state, action.key, action.value as TaskQuickCreateFormValues[typeof action.key]);
    case "replace-values":
      return replaceTaskQuickCreateFormValues(state, action.values);
    case "reset":
      return resetTaskQuickCreateFormState(state);
    case "sync-baseline":
      return syncTaskQuickCreateFormBaseline(state, action.baseline);
  }
}

export function setTaskQuickCreateFormField<K extends TaskQuickCreateFormFieldKey>(
  key: K,
  value: TaskQuickCreateFormValues[K],
): TaskQuickCreateFormAction {
  return {
    type: "set-field",
    key,
    value,
  };
}

export function replaceTaskQuickCreateFormAction(values: TaskQuickCreateFormValues): TaskQuickCreateFormAction {
  return {
    type: "replace-values",
    values,
  };
}

export function resetTaskQuickCreateFormAction(): TaskQuickCreateFormAction {
  return {
    type: "reset",
  };
}

export function syncTaskQuickCreateFormBaselineAction(baseline: TaskQuickCreateFormValues): TaskQuickCreateFormAction {
  return {
    type: "sync-baseline",
    baseline,
  };
}

export function useTaskQuickCreateFormState(baseline: TaskQuickCreateFormValues) {
  const [state, dispatch] = useReducer(taskQuickCreateFormReducer, baseline, createTaskQuickCreateFormState);

  // The coordinator will pass a fresh baseline when quick-create defaults change.
  // Keep the local draft in sync only when that baseline actually changes.
  useEffect(() => {
    dispatch(syncTaskQuickCreateFormBaselineAction(baseline));
  }, [baseline]);

  return [state, dispatch] as const;
}
