"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePathname } from "next/navigation";
import { useProjectMeta } from "@/providers/project-provider";
import { previewFiles, previewSystemMode, previewTasks } from "@/lib/preview/demo-data";
import { localizeError, type ErrorCopyKey } from "@/lib/ui-copy";
import type { FileRecord, TaskRecord } from "@/domains/task/types";

export type DashboardScope = "active" | "trash";
export type DashboardSystemMode = {
  backendMode: string;
  dataMode: string;
  uploadMode: string;
  hasSupabase: boolean;
  hasFirebaseProjectId: boolean;
};

type DashboardScopeState = {
  tasks: TaskRecord[];
  files: FileRecord[];
  filesByTaskId: Record<string, FileRecord[]>;
  loadedTaskFileIds: string[];
  requestedTaskFileIds: string[];
  loadingTaskFileIds: string[];
  systemMode: DashboardSystemMode | null;
  loading: boolean;
  loaded: boolean;
  errorMessage: string | null;
};

type DashboardStateByScope = Record<DashboardScope, DashboardScopeState>;
type DashboardProviderState = {
  ownerKey: string;
  stateByScope: DashboardStateByScope;
};
type DashboardRefreshOptions = {
  force?: boolean;
};

type DashboardTaskFilesRefreshOptions = {
  force?: boolean;
};

type DashboardDataContextValue = {
  stateByScope: DashboardStateByScope;
  ensureDashboardScopeLoaded: (scope: DashboardScope) => Promise<void>;
  refreshDashboardScope: (scope: DashboardScope, options?: DashboardRefreshOptions) => Promise<void>;
  ensureDashboardTaskFilesLoaded: (
    scope: DashboardScope,
    taskId: string,
    options?: DashboardTaskFilesRefreshOptions,
  ) => Promise<void>;
  refreshDashboardTaskFiles: (
    scope: DashboardScope,
    taskId: string,
    options?: DashboardTaskFilesRefreshOptions,
  ) => Promise<void>;
  setDashboardTasks: (scope: DashboardScope, updater: SetStateAction<TaskRecord[]>) => void;
  setDashboardErrorMessage: (scope: DashboardScope, updater: SetStateAction<string | null>) => void;
};

const emptyScopeState = (): DashboardScopeState => ({
  tasks: [],
  files: [],
  filesByTaskId: {},
  loadedTaskFileIds: [],
  requestedTaskFileIds: [],
  loadingTaskFileIds: [],
  systemMode: null,
  loading: false,
  loaded: false,
  errorMessage: null,
});

function createEmptyStateByScope(): DashboardStateByScope {
  return {
    active: emptyScopeState(),
    trash: emptyScopeState(),
  };
}

function buildDashboardOwnerKey(currentProjectId: string | null, selectionVersion: number, isPreview: boolean) {
  return `${currentProjectId ?? "no-project"}:${selectionVersion}:${isPreview ? "preview" : "live"}`;
}

function groupFilesByTaskId(files: FileRecord[]) {
  return files.reduce<Record<string, FileRecord[]>>((acc, file) => {
    if (!acc[file.taskId]) {
      acc[file.taskId] = [];
    }

    acc[file.taskId].push(file);
    return acc;
  }, {});
}

function flattenFilesByTaskId(filesByTaskId: Record<string, FileRecord[]>) {
  return Object.values(filesByTaskId).flat();
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

function buildPreviewScopeState(scope: DashboardScope): DashboardScopeState {
  const tasks =
    scope === "trash"
      ? previewTasks.filter((task) => task.deletedAt && !task.purgedAt)
      : previewTasks.filter((task) => !task.deletedAt && !task.purgedAt);
  const files =
    scope === "trash"
      ? previewFiles.filter((file) => file.deletedAt && !file.purgedAt)
      : previewFiles.filter((file) => !file.deletedAt && !file.purgedAt);

  return {
    tasks,
    files,
    filesByTaskId: groupFilesByTaskId(files),
    loadedTaskFileIds: [...new Set(files.map((file) => file.taskId))],
    requestedTaskFileIds: [...new Set(files.map((file) => file.taskId))],
    loadingTaskFileIds: [],
    systemMode: previewSystemMode,
    loading: false,
    loaded: true,
    errorMessage: null,
  };
}

async function readDashboardErrorMessage(response: Response, fallbackKey: ErrorCopyKey) {
  try {
    const json = (await response.json()) as { error?: { code?: string | null } };
    return localizeError({ code: json.error?.code, fallbackKey });
  } catch {
    return localizeError({ fallbackKey });
  }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const { currentProjectId, projectLoaded, selectionVersion } = useProjectMeta();
  const ownerKey = buildDashboardOwnerKey(currentProjectId, selectionVersion, isPreview);
  const emptyStateByScope = useMemo(() => createEmptyStateByScope(), []);
  const [providerState, setProviderState] = useState<DashboardProviderState>(() => ({
    ownerKey,
    stateByScope: createEmptyStateByScope(),
  }));
  const stateRef = useRef(providerState);
  const inFlightRef = useRef<
    Partial<
      Record<
        DashboardScope,
        {
          ownerKey: string;
          requestId: number;
          promise: Promise<void>;
        }
      >
    >
  >({});
  const requestIdRef = useRef<Record<DashboardScope, number>>({
    active: 0,
    trash: 0,
  });
  const taskFilesInFlightRef = useRef<Record<string, { ownerKey: string; requestId: number; promise: Promise<void> }>>({});
  const taskFilesRequestIdRef = useRef<Record<string, number>>({});

  stateRef.current = providerState;

  useEffect(() => {
    if (stateRef.current.ownerKey === ownerKey) {
      return;
    }

    inFlightRef.current = {};
    requestIdRef.current = {
      active: 0,
      trash: 0,
    };
    taskFilesInFlightRef.current = {};
    taskFilesRequestIdRef.current = {};
    setProviderState({
      ownerKey,
      stateByScope: createEmptyStateByScope(),
    });
  }, [ownerKey]);

  const visibleStateByScope = providerState.ownerKey === ownerKey ? providerState.stateByScope : emptyStateByScope;

  const fetchDashboardScope = useCallback(
    async (scope: DashboardScope, options?: DashboardRefreshOptions) => {
      const force = options?.force ?? false;

      if (isPreview || !projectLoaded) {
        return;
      }

      const currentState =
        stateRef.current.ownerKey === ownerKey ? stateRef.current.stateByScope[scope] : emptyScopeState();
      if (!force && currentState.loaded) {
        return;
      }

      const currentInFlight = inFlightRef.current[scope];
      if (!force && currentInFlight?.ownerKey === ownerKey) {
        return currentInFlight.promise;
      }

      setProviderState((previous) => {
        if (previous.ownerKey !== ownerKey) {
          return previous;
        }

        return {
          ...previous,
          stateByScope: {
            ...previous.stateByScope,
            [scope]: {
              ...previous.stateByScope[scope],
              loading: true,
              errorMessage: null,
            },
          },
        };
      });
      const requestId = requestIdRef.current[scope] + 1;
      requestIdRef.current[scope] = requestId;

      const request = (async () => {
        try {
          const [taskResponse, statusResponse] = await Promise.all([
            fetch(`/api/tasks${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
            fetch("/api/system/status", { cache: "no-store" }),
          ]);

          if (!taskResponse.ok) {
            throw new Error(await readDashboardErrorMessage(taskResponse, "loadTasksFailed"));
          }

          const taskJson = (await taskResponse.json()) as { data: TaskRecord[] };
          const statusJson = statusResponse.ok ? ((await statusResponse.json()) as { data: DashboardSystemMode }) : { data: null };

          if (stateRef.current.ownerKey !== ownerKey || requestIdRef.current[scope] !== requestId) {
            return;
          }

          setProviderState((previous) => {
            if (previous.ownerKey !== ownerKey || requestIdRef.current[scope] !== requestId) {
              return previous;
            }

            return {
              ...previous,
              stateByScope: {
                ...previous.stateByScope,
                [scope]: {
                  tasks: taskJson.data,
                  files: previous.stateByScope[scope].files,
                  filesByTaskId: previous.stateByScope[scope].filesByTaskId,
                  loadedTaskFileIds: previous.stateByScope[scope].loadedTaskFileIds,
                  requestedTaskFileIds: previous.stateByScope[scope].requestedTaskFileIds,
                  loadingTaskFileIds: previous.stateByScope[scope].loadingTaskFileIds,
                  systemMode: statusJson.data ?? null,
                  loading: false,
                  loaded: true,
                  errorMessage: null,
                },
              },
            };
          });
        } catch (error) {
          if (stateRef.current.ownerKey !== ownerKey || requestIdRef.current[scope] !== requestId) {
            return;
          }

          setProviderState((previous) => {
            if (previous.ownerKey !== ownerKey || requestIdRef.current[scope] !== requestId) {
              return previous;
            }

            return {
              ...previous,
              stateByScope: {
                ...previous.stateByScope,
                [scope]: {
                  ...previous.stateByScope[scope],
                  loading: false,
                  loaded: previous.stateByScope[scope].loaded,
                  errorMessage: error instanceof Error ? error.message : localizeError({ fallbackKey: "loadDashboardFailed" }),
                },
              },
            };
          });
        } finally {
          const activeRequest = inFlightRef.current[scope];
          if (activeRequest?.ownerKey === ownerKey && activeRequest.requestId === requestId) {
            delete inFlightRef.current[scope];
          }
        }
      })();

      inFlightRef.current[scope] = {
        ownerKey,
        requestId,
        promise: request,
      };
      return request;
    },
    [isPreview, ownerKey, projectLoaded],
  );

  const ensureDashboardScopeLoaded = useCallback(
    async (scope: DashboardScope) => {
      if (isPreview) {
        return;
      }

      await fetchDashboardScope(scope);
    },
    [fetchDashboardScope, isPreview],
  );

  const refreshDashboardScope = useCallback(
    async (scope: DashboardScope, options?: DashboardRefreshOptions) => {
      if (isPreview) {
        return;
      }

      await fetchDashboardScope(scope, { force: options?.force ?? true });
    },
    [fetchDashboardScope, isPreview],
  );

  const fetchDashboardTaskFiles = useCallback(
    async (scope: DashboardScope, taskId: string, options?: DashboardTaskFilesRefreshOptions) => {
      const force = options?.force ?? false;
      const normalizedTaskId = taskId.trim();

      if (isPreview || !normalizedTaskId) {
        return;
      }

      const currentState = stateRef.current.ownerKey === ownerKey ? stateRef.current.stateByScope[scope] : emptyScopeState();
      if (!force && currentState.loadedTaskFileIds.includes(normalizedTaskId)) {
        return;
      }
      if (!force && currentState.requestedTaskFileIds.includes(normalizedTaskId)) {
        return;
      }

      const taskFileKey = `${scope}:${normalizedTaskId}`;
      const currentInFlight = taskFilesInFlightRef.current[taskFileKey];
      if (!force && currentInFlight?.ownerKey === ownerKey) {
        return currentInFlight.promise;
      }

      setProviderState((previous) => {
        if (previous.ownerKey !== ownerKey) {
          return previous;
        }

        return {
          ...previous,
          stateByScope: {
            ...previous.stateByScope,
            [scope]: {
              ...previous.stateByScope[scope],
              requestedTaskFileIds: previous.stateByScope[scope].requestedTaskFileIds.includes(normalizedTaskId)
                ? previous.stateByScope[scope].requestedTaskFileIds
                : [...previous.stateByScope[scope].requestedTaskFileIds, normalizedTaskId],
              loadingTaskFileIds: previous.stateByScope[scope].loadingTaskFileIds.includes(normalizedTaskId)
                ? previous.stateByScope[scope].loadingTaskFileIds
                : [...previous.stateByScope[scope].loadingTaskFileIds, normalizedTaskId],
              errorMessage: null,
            },
          },
        };
      });

      const requestId = (taskFilesRequestIdRef.current[taskFileKey] ?? 0) + 1;
      taskFilesRequestIdRef.current[taskFileKey] = requestId;

      const request = (async () => {
        try {
          const response = await fetch(
            `/api/files?scope=${scope === "trash" ? "trash" : "active"}&taskId=${encodeURIComponent(normalizedTaskId)}`,
            { cache: "no-store" },
          );

          if (!response.ok) {
            throw new Error(await readDashboardErrorMessage(response, "loadFilesFailed"));
          }

          const json = (await response.json()) as { data: FileRecord[] };

          if (stateRef.current.ownerKey !== ownerKey || taskFilesRequestIdRef.current[taskFileKey] !== requestId) {
            return;
          }

          setProviderState((previous) => {
            if (previous.ownerKey !== ownerKey || taskFilesRequestIdRef.current[taskFileKey] !== requestId) {
              return previous;
            }

            const nextFilesByTaskId = {
              ...previous.stateByScope[scope].filesByTaskId,
              [normalizedTaskId]: json.data,
            };

            return {
              ...previous,
              stateByScope: {
                ...previous.stateByScope,
                [scope]: {
                  ...previous.stateByScope[scope],
                  filesByTaskId: nextFilesByTaskId,
                  files: flattenFilesByTaskId(nextFilesByTaskId),
                  loadedTaskFileIds: previous.stateByScope[scope].loadedTaskFileIds.includes(normalizedTaskId)
                    ? previous.stateByScope[scope].loadedTaskFileIds
                    : [...previous.stateByScope[scope].loadedTaskFileIds, normalizedTaskId],
                  requestedTaskFileIds: previous.stateByScope[scope].requestedTaskFileIds,
                  loadingTaskFileIds: previous.stateByScope[scope].loadingTaskFileIds.filter((id) => id !== normalizedTaskId),
                  errorMessage: null,
                },
              },
            };
          });
        } catch (error) {
          if (stateRef.current.ownerKey !== ownerKey || taskFilesRequestIdRef.current[taskFileKey] !== requestId) {
            return;
          }

          setProviderState((previous) => {
            if (previous.ownerKey !== ownerKey || taskFilesRequestIdRef.current[taskFileKey] !== requestId) {
              return previous;
            }

            return {
              ...previous,
              stateByScope: {
                ...previous.stateByScope,
                [scope]: {
                  ...previous.stateByScope[scope],
                  requestedTaskFileIds: previous.stateByScope[scope].requestedTaskFileIds.includes(normalizedTaskId)
                    ? previous.stateByScope[scope].requestedTaskFileIds
                    : [...previous.stateByScope[scope].requestedTaskFileIds, normalizedTaskId],
                  loadingTaskFileIds: previous.stateByScope[scope].loadingTaskFileIds.filter((id) => id !== normalizedTaskId),
                  errorMessage: error instanceof Error ? error.message : localizeError({ fallbackKey: "loadDashboardFailed" }),
                },
              },
            };
          });
        } finally {
          const activeRequest = taskFilesInFlightRef.current[taskFileKey];
          if (activeRequest?.ownerKey === ownerKey && activeRequest.requestId === requestId) {
            delete taskFilesInFlightRef.current[taskFileKey];
          }
        }
      })();

      taskFilesInFlightRef.current[taskFileKey] = {
        ownerKey,
        requestId,
        promise: request,
      };

      return request;
    },
    [isPreview, ownerKey],
  );

  const ensureDashboardTaskFilesLoaded = useCallback(
    async (scope: DashboardScope, taskId: string, options?: DashboardTaskFilesRefreshOptions) => {
      if (isPreview) {
        return;
      }

      await fetchDashboardTaskFiles(scope, taskId, options);
    },
    [fetchDashboardTaskFiles, isPreview],
  );

  const refreshDashboardTaskFiles = useCallback(
    async (scope: DashboardScope, taskId: string, options?: DashboardTaskFilesRefreshOptions) => {
      if (isPreview) {
        return;
      }

      await fetchDashboardTaskFiles(scope, taskId, { force: options?.force ?? true });
    },
    [fetchDashboardTaskFiles, isPreview],
  );

  const setDashboardTasks = useCallback(
    (scope: DashboardScope, updater: SetStateAction<TaskRecord[]>) => {
      setProviderState((previous) => {
        if (previous.ownerKey !== ownerKey) {
          return previous;
        }

        return {
          ...previous,
          stateByScope: {
            ...previous.stateByScope,
            [scope]: {
              ...previous.stateByScope[scope],
              tasks: typeof updater === "function" ? updater(previous.stateByScope[scope].tasks) : updater,
              loaded: true,
            },
          },
        };
      });
    },
    [ownerKey],
  );

  const setDashboardErrorMessage = useCallback(
    (scope: DashboardScope, updater: SetStateAction<string | null>) => {
      setProviderState((previous) => {
        if (previous.ownerKey !== ownerKey) {
          return previous;
        }

        return {
          ...previous,
          stateByScope: {
            ...previous.stateByScope,
            [scope]: {
              ...previous.stateByScope[scope],
              errorMessage:
                typeof updater === "function" ? updater(previous.stateByScope[scope].errorMessage) : updater,
            },
          },
        };
      });
    },
    [ownerKey],
  );

  const value = useMemo<DashboardDataContextValue>(
    () => ({
      stateByScope: visibleStateByScope,
      ensureDashboardScopeLoaded,
      refreshDashboardScope,
      ensureDashboardTaskFilesLoaded,
      refreshDashboardTaskFiles,
      setDashboardTasks,
      setDashboardErrorMessage,
    }),
    [
      ensureDashboardScopeLoaded,
      ensureDashboardTaskFilesLoaded,
      refreshDashboardScope,
      refreshDashboardTaskFiles,
      setDashboardErrorMessage,
      setDashboardTasks,
      visibleStateByScope,
    ],
  );

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext);

  if (!context) {
    throw new Error("useDashboardData must be used within DashboardProvider");
  }

  return context;
}

export function useDashboardScope(scope: DashboardScope) {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const context = useDashboardData();
  const [localPreviewErrorMessage, setLocalPreviewErrorMessage] = useState<string | null>(null);
  const {
    stateByScope,
    ensureDashboardScopeLoaded,
    refreshDashboardScope,
    ensureDashboardTaskFilesLoaded,
    refreshDashboardTaskFiles,
    setDashboardTasks,
    setDashboardErrorMessage,
  } = context;
  const previewState = useMemo(() => buildPreviewScopeState(scope), [scope]);
  const scopeState = stateByScope[scope];
  const computedLoading = scopeState.loading || (!scopeState.loaded && !scopeState.errorMessage);
  const files = useMemo(() => flattenFilesByTaskId(scopeState.filesByTaskId), [scopeState.filesByTaskId]);
  const filesByTaskId = useMemo(() => scopeState.filesByTaskId, [scopeState.filesByTaskId]);

  const ensureLoaded = useCallback(() => {
    if (isPreview) {
      return Promise.resolve();
    }

    return ensureDashboardScopeLoaded(scope);
  }, [ensureDashboardScopeLoaded, isPreview, scope]);

  const refreshScope = useCallback(
    (options?: DashboardRefreshOptions) => {
      if (isPreview) {
        return Promise.resolve();
      }

      return refreshDashboardScope(scope, options);
    },
    [isPreview, refreshDashboardScope, scope],
  );

  const setTasks = useCallback(
    (updater: SetStateAction<TaskRecord[]>) => {
      if (isPreview) {
        return;
      }

      setDashboardTasks(scope, updater);
    },
    [isPreview, scope, setDashboardTasks],
  );

  const ensureTaskFilesLoaded = useCallback(
    (taskId: string, options?: DashboardTaskFilesRefreshOptions) => {
      if (isPreview) {
        return Promise.resolve();
      }

      return ensureDashboardTaskFilesLoaded(scope, taskId, options);
    },
    [ensureDashboardTaskFilesLoaded, isPreview, scope],
  );

  const refreshTaskFiles = useCallback(
    (taskId: string, options?: DashboardTaskFilesRefreshOptions) => {
      if (isPreview) {
        return Promise.resolve();
      }

      return refreshDashboardTaskFiles(scope, taskId, options);
    },
    [isPreview, refreshDashboardTaskFiles, scope],
  );

  const setErrorMessage = useCallback(
    (updater: SetStateAction<string | null>) => {
      if (isPreview) {
        setLocalPreviewErrorMessage(updater);
        return;
      }

      setDashboardErrorMessage(scope, updater);
    },
    [isPreview, scope, setDashboardErrorMessage],
  );

  return useMemo(
    () =>
      isPreview
        ? {
            ...previewState,
            loading: false,
            errorMessage: localPreviewErrorMessage,
            files: previewState.files,
            filesByTaskId: previewState.filesByTaskId,
            loadedTaskFileIds: previewState.loadedTaskFileIds,
            loadingTaskFileIds: previewState.loadingTaskFileIds,
            ensureLoaded,
            refreshScope,
            ensureTaskFilesLoaded,
            refreshTaskFiles,
            setTasks,
            setErrorMessage,
          }
        : {
            ...scopeState,
            files,
            filesByTaskId,
            loading: computedLoading,
            ensureLoaded,
            refreshScope,
            ensureTaskFilesLoaded,
            refreshTaskFiles,
            setTasks,
            setErrorMessage,
          },
    [
      computedLoading,
      ensureLoaded,
      ensureTaskFilesLoaded,
      isPreview,
      localPreviewErrorMessage,
      previewState,
      refreshScope,
      refreshTaskFiles,
      scopeState,
      setErrorMessage,
      setTasks,
      files,
      filesByTaskId,
    ],
  );
}
