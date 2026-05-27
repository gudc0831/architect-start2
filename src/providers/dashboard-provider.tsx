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
import {
  readDashboardTaskSnapshot,
  readLastDashboardSnapshotProjectId,
  writeDashboardTaskSnapshot,
} from "@/lib/workspace/dashboard-snapshot-cache";
import { fetchWorkspaceBootstrap, isWorkspaceBootstrapPath } from "@/lib/workspace/bootstrap-client";
import type { DashboardSystemMode } from "@/lib/workspace/bootstrap-types";
import type { FileRecord, TaskRecord } from "@/domains/task/types";

export type DashboardScope = "active" | "trash";
export type { DashboardSystemMode } from "@/lib/workspace/bootstrap-types";

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
  silent?: boolean;
};

type DashboardTaskFilesRefreshOptions = {
  force?: boolean;
  surfaceErrors?: boolean;
};

type ProjectChangesPayload = {
  projectId: string;
  version: string;
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
  setDashboardFiles: (scope: DashboardScope, updater: SetStateAction<FileRecord[]>) => void;
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

type ActiveTaskOrderScope = "daily" | null;

function buildDashboardOwnerKey(
  currentProjectId: string | null,
  selectionVersion: number,
  isPreview: boolean,
  activeTaskOrderScope: ActiveTaskOrderScope,
) {
  return `${currentProjectId ?? "no-project"}:${selectionVersion}:${isPreview ? "preview" : "live"}:${activeTaskOrderScope ?? "default"}`;
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
const PROJECT_CHANGES_POLL_INTERVAL_MS = 12_000;

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

function shouldRetryDashboardRead(status: number) {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchDashboardRead(input: RequestInfo | URL, init?: RequestInit) {
  const maxAttempts = 3;
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      lastResponse = response;
      if (response.ok || !shouldRetryDashboardRead(response.status) || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await wait(250 * attempt);
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError instanceof Error ? lastError : new Error("Dashboard request failed");
}

async function fetchDashboardSystemMode() {
  const statusResponse = await fetchDashboardRead("/api/system/status", { cache: "no-store" });
  if (!statusResponse.ok) {
    return null;
  }

  const statusJson = (await statusResponse.json()) as { data: DashboardSystemMode | null };
  return statusJson.data ?? null;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const shouldUseWorkspaceBootstrap = isWorkspaceBootstrapPath(pathname);
  const activeTaskOrderScope: ActiveTaskOrderScope = pathname === "/daily" ? "daily" : null;
  const { currentProjectId, projectLoaded, selectionVersion } = useProjectMeta();
  const ownerKey = buildDashboardOwnerKey(currentProjectId, selectionVersion, isPreview, activeTaskOrderScope);
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
  const projectChangeVersionRef = useRef<{ ownerKey: string; version: string | null }>({ ownerKey, version: null });
  const snapshotRestoreAttemptedRef = useRef<Set<string>>(new Set());

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
    projectChangeVersionRef.current = { ownerKey, version: null };
    setProviderState({
      ownerKey,
      stateByScope: createEmptyStateByScope(),
    });
  }, [ownerKey]);

  const visibleStateByScope = providerState.ownerKey === ownerKey ? providerState.stateByScope : emptyStateByScope;

  useEffect(() => {
    if (isPreview || activeTaskOrderScope === "daily") {
      return;
    }

    const snapshotProjectId = currentProjectId ?? readLastDashboardSnapshotProjectId();
    if (!snapshotProjectId) {
      return;
    }

    const restoreOwnerKey = ownerKey;
    const restoreKey = `${restoreOwnerKey}:active:${snapshotProjectId}`;
    if (snapshotRestoreAttemptedRef.current.has(restoreKey)) {
      return;
    }
    snapshotRestoreAttemptedRef.current.add(restoreKey);

    let cancelled = false;
    void readDashboardTaskSnapshot(snapshotProjectId, "active")
      .then((snapshot) => {
        if (cancelled || !snapshot || stateRef.current.ownerKey !== restoreOwnerKey) {
          return;
        }

        setProviderState((previous) => {
          if (previous.ownerKey !== restoreOwnerKey) {
            return previous;
          }

          const activeState = previous.stateByScope.active;
          if (activeState.loaded || activeState.tasks.length > 0) {
            return previous;
          }

          return {
            ...previous,
            stateByScope: {
              ...previous.stateByScope,
              active: {
                ...activeState,
                tasks: snapshot.tasks,
                systemMode: activeState.systemMode ?? snapshot.systemMode,
                errorMessage: null,
                loaded: false,
              },
            },
          };
        });
      })
      .catch(() => {
        // Snapshot restore is a best-effort paint acceleration. Server reads remain authoritative.
      });

    return () => {
      cancelled = true;
    };
  }, [activeTaskOrderScope, currentProjectId, isPreview, ownerKey, projectLoaded]);

  useEffect(() => {
    if (isPreview || activeTaskOrderScope === "daily" || !currentProjectId || providerState.ownerKey !== ownerKey) {
      return;
    }

    const activeState = providerState.stateByScope.active;
    if (!activeState.loaded || activeState.tasks.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void writeDashboardTaskSnapshot({
        projectId: currentProjectId,
        scope: "active",
        tasks: activeState.tasks,
        systemMode: activeState.systemMode,
      }).catch(() => {
        // Snapshot writes must never interfere with spreadsheet interactions.
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTaskOrderScope, currentProjectId, isPreview, ownerKey, providerState]);

  const fetchDashboardScope = useCallback(
    async (scope: DashboardScope, options?: DashboardRefreshOptions) => {
      const force = options?.force ?? false;

      if (isPreview || !projectLoaded) {
        return;
      }

      const currentState =
        stateRef.current.ownerKey === ownerKey ? stateRef.current.stateByScope[scope] : emptyScopeState();
      const shouldShowLoading = !options?.silent || !currentState.loaded;
      const shouldSurfaceError = shouldShowLoading;
      if (!force && currentState.loaded) {
        return;
      }

      const currentInFlight = inFlightRef.current[scope];
      if (!force && currentInFlight?.ownerKey === ownerKey) {
        return currentInFlight.promise;
      }

      if (shouldShowLoading) {
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
      }
      const requestId = requestIdRef.current[scope] + 1;
      requestIdRef.current[scope] = requestId;

      const request = (async () => {
        try {
          const taskJson =
            shouldUseWorkspaceBootstrap && scope === "active" && !force
              ? await (async () => {
                  const bootstrap = await fetchWorkspaceBootstrap(activeTaskOrderScope);
                  if (!bootstrap.activeTasks) {
                    throw new Error(
                      localizeError({ code: bootstrap.activeTasksError?.code ?? undefined, fallbackKey: "loadTasksFailed" }),
                    );
                  }

                  return { data: bootstrap.activeTasks };
                })()
              : await (async () => {
                  const taskParams = new URLSearchParams();
                  if (scope === "trash") {
                    taskParams.set("scope", "trash");
                  } else if (activeTaskOrderScope === "daily") {
                    taskParams.set("orderScope", "daily");
                  }
                  const taskUrl = `/api/tasks${taskParams.size > 0 ? `?${taskParams.toString()}` : ""}`;
                  const taskResponse = await fetchDashboardRead(taskUrl, { cache: "no-store" });

                  if (!taskResponse.ok) {
                    throw new Error(await readDashboardErrorMessage(taskResponse, "loadTasksFailed"));
                  }

                  return (await taskResponse.json()) as { data: TaskRecord[] };
                })();

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
                  systemMode: previous.stateByScope[scope].systemMode,
                  loading: false,
                  loaded: true,
                  errorMessage: null,
                },
              },
            };
          });

          void fetchDashboardSystemMode()
            .then((systemMode) => {
              if (!systemMode || stateRef.current.ownerKey !== ownerKey || requestIdRef.current[scope] !== requestId) {
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
                      systemMode,
                    },
                  },
                };
              });
            })
            .catch(() => {
              // System status is informational; task rendering should not wait for it.
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
                  errorMessage: shouldSurfaceError
                    ? error instanceof Error
                      ? error.message
                      : localizeError({ fallbackKey: "loadDashboardFailed" })
                    : previous.stateByScope[scope].errorMessage,
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
    [activeTaskOrderScope, isPreview, ownerKey, projectLoaded, shouldUseWorkspaceBootstrap],
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

      await fetchDashboardScope(scope, { force: options?.force ?? true, silent: options?.silent });
    },
    [fetchDashboardScope, isPreview],
  );

  useEffect(() => {
    if (isPreview || !projectLoaded || !currentProjectId) {
      return;
    }

    let cancelled = false;

    async function pollProjectChanges() {
      try {
        const response = await fetch("/api/project/changes", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const json = (await response.json()) as { data?: ProjectChangesPayload };
        const version = json.data?.version;
        if (cancelled || !version || stateRef.current.ownerKey !== ownerKey) {
          return;
        }

        const previous = projectChangeVersionRef.current;
        if (previous.ownerKey !== ownerKey) {
          projectChangeVersionRef.current = { ownerKey, version };
          return;
        }

        if (!previous.version) {
          projectChangeVersionRef.current = { ownerKey, version };
          return;
        }

        if (previous.version === version) {
          return;
        }

        projectChangeVersionRef.current = { ownerKey, version };
        const currentState = stateRef.current.stateByScope;
        await Promise.all([
          currentState.active.loaded ? refreshDashboardScope("active", { force: true, silent: true }) : Promise.resolve(),
          currentState.trash.loaded ? refreshDashboardScope("trash", { force: true, silent: true }) : Promise.resolve(),
        ]);
      } catch {
        // Polling is a best-effort invalidation fallback; normal user actions still refresh explicitly.
      }
    }

    void pollProjectChanges();
    const intervalId = window.setInterval(() => {
      void pollProjectChanges();
    }, PROJECT_CHANGES_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentProjectId, isPreview, ownerKey, projectLoaded, refreshDashboardScope]);

  const fetchDashboardTaskFiles = useCallback(
    async (scope: DashboardScope, taskId: string, options?: DashboardTaskFilesRefreshOptions) => {
      const force = options?.force ?? false;
      const shouldSurfaceError = options?.surfaceErrors ?? force;
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
          const response = await fetchDashboardRead(
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
                  errorMessage: shouldSurfaceError
                    ? error instanceof Error
                      ? error.message
                      : localizeError({ fallbackKey: "loadDashboardFailed" })
                    : previous.stateByScope[scope].errorMessage,
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

  const invalidateDashboardScopeRead = useCallback((scope: DashboardScope) => {
    requestIdRef.current[scope] += 1;
    delete inFlightRef.current[scope];
  }, []);

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

      await fetchDashboardTaskFiles(scope, taskId, {
        force: options?.force ?? true,
        surfaceErrors: options?.surfaceErrors ?? true,
      });
    },
    [fetchDashboardTaskFiles, isPreview],
  );

  const setDashboardTasks = useCallback(
    (scope: DashboardScope, updater: SetStateAction<TaskRecord[]>) => {
      invalidateDashboardScopeRead(scope);
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
    [invalidateDashboardScopeRead, ownerKey],
  );

  const setDashboardFiles = useCallback(
    (scope: DashboardScope, updater: SetStateAction<FileRecord[]>) => {
      invalidateDashboardScopeRead(scope);
      setProviderState((previous) => {
        if (previous.ownerKey !== ownerKey) {
          return previous;
        }

        const previousScope = previous.stateByScope[scope];
        const nextFiles = typeof updater === "function" ? updater(previousScope.files) : updater;
        const nextFilesByTaskId = groupFilesByTaskId(nextFiles);

        return {
          ...previous,
          stateByScope: {
            ...previous.stateByScope,
            [scope]: {
              ...previousScope,
              filesByTaskId: nextFilesByTaskId,
              files: flattenFilesByTaskId(nextFilesByTaskId),
            },
          },
        };
      });
    },
    [invalidateDashboardScopeRead, ownerKey],
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
      setDashboardFiles,
      setDashboardErrorMessage,
    }),
    [
      ensureDashboardScopeLoaded,
      ensureDashboardTaskFilesLoaded,
      refreshDashboardScope,
      refreshDashboardTaskFiles,
      setDashboardErrorMessage,
      setDashboardFiles,
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
    setDashboardFiles,
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

  const setFiles = useCallback(
    (updater: SetStateAction<FileRecord[]>) => {
      if (isPreview) {
        return;
      }

      setDashboardFiles(scope, updater);
    },
    [isPreview, scope, setDashboardFiles],
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
            setFiles,
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
            setFiles,
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
      setFiles,
      setTasks,
      files,
      filesByTaskId,
    ],
  );
}
