"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { TaskGridCellKey } from "@/components/tasks/task-grid-dom-registry";

export type TaskEditorDraftSession = TaskGridCellKey;

export type TaskEditorDraftSnapshot<TDraft> = Readonly<{
  revision: number;
  session: TaskEditorDraftSession | null;
  draft: TDraft | null;
  isEditing: boolean;
}>;

export type TaskEditorDraftUpdate<TDraft> = TDraft | ((previous: TDraft) => TDraft);

export type TaskEditorDraftCommit<TDraft> = Readonly<{
  session: TaskEditorDraftSession;
  draft: TDraft;
}>;

export type TaskEditorDraftStore<TDraft> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TaskEditorDraftSnapshot<TDraft>;
  beginInlineEdit: (session: TaskEditorDraftSession, draft: TDraft) => void;
  updateInlineValue: (nextDraft: TaskEditorDraftUpdate<TDraft>) => void;
  commitInlineEdit: () => TaskEditorDraftCommit<TDraft> | null;
  cancelInlineEdit: () => TaskEditorDraftCommit<TDraft> | null;
  clear: () => void;
};

function resolveNextDraft<TDraft>(currentDraft: TDraft, nextDraft: TaskEditorDraftUpdate<TDraft>) {
  return typeof nextDraft === "function" ? (nextDraft as (previous: TDraft) => TDraft)(currentDraft) : nextDraft;
}

function createTaskEditorDraftSnapshot<TDraft>(
  revision: number,
  session: TaskEditorDraftSession | null,
  draft: TDraft | null,
): TaskEditorDraftSnapshot<TDraft> {
  return {
    revision,
    session,
    draft,
    isEditing: Boolean(session && draft !== null),
  };
}

export function createTaskEditorDraftStore<TDraft>(): TaskEditorDraftStore<TDraft> {
  let revision = 0;
  let session: TaskEditorDraftSession | null = null;
  let draft: TDraft | null = null;
  let snapshot = createTaskEditorDraftSnapshot<TDraft>(revision, session, draft);
  const listeners = new Set<() => void>();

  const notify = () => {
    revision += 1;
    snapshot = createTaskEditorDraftSnapshot(revision, session, draft);
    listeners.forEach((listener) => listener());
  };

  const clearState = () => {
    if (!session && draft === null) {
      return null;
    }

    const committed = session && draft !== null ? { session, draft } : null;
    session = null;
    draft = null;
    notify();
    return committed;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    beginInlineEdit(nextSession, nextDraft) {
      if (session?.taskId === nextSession.taskId && session.columnKey === nextSession.columnKey && Object.is(draft, nextDraft)) {
        return;
      }

      session = nextSession;
      draft = nextDraft;
      notify();
    },
    updateInlineValue(nextDraft) {
      if (!session || draft === null) {
        return;
      }

      const resolvedDraft = resolveNextDraft(draft, nextDraft);
      if (Object.is(resolvedDraft, draft)) {
        return;
      }

      draft = resolvedDraft;
      notify();
    },
    commitInlineEdit() {
      const committed = clearState();
      return committed;
    },
    cancelInlineEdit() {
      const committed = clearState();
      return committed;
    },
    clear() {
      clearState();
    },
  };
}

export function useTaskEditorDraftStoreSnapshot<TDraft>(store: TaskEditorDraftStore<TDraft>) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
