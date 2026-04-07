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

type DashboardDataContextValue = {
  stateByScope: DashboardStateByScope;
  ensureDashboardScopeLoaded: (scope: DashboardScope) => Promise<void>;
  refreshDashboardScope: (scope: DashboardScope, options?: DashboardRefreshOptions) => Promise<void>;
  setDashboardTasks: (scope: DashboardScope, updater: SetStateAction<TaskRecord[]>) => void;
  setDashboardFiles: (scope: DashboardScope, updater: SetStateAction<FileRecord[]>) => void;
  setDashboardErrorMessage: (scope: DashboardScope, updater: SetStateAction<string | null>) => void;
};

const emptyScopeState = (): DashboardScopeState => ({
  tasks: [],
  files: [],
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

function buildDashboardOwnerKey(currentProjectId: string | null, isPreview: boolean) {
  return `${currentProjectId ?? "no-project"}:${isPreview ? "preview" : "live"}`;
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

function buildPreviewScopeState(scope: DashboardScope): DashboardScopeState {
  const tasks = scope === "trash" ? previewTasks.filter((task) => task.deletedAt) : previewTasks.filter((task) => !task.deletedAt);
  const files = scope === "trash" ? previewFiles.filter((file) => file.deletedAt) : previewFiles.filter((file) => !file.deletedAt);

  return {
    tasks,
    files,
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
  const { currentProjectId, projectLoaded } = useProjectMeta();
  const ownerKey = buildDashboardOwnerKey(currentProjectId, isPreview);
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
          const [taskResponse, fileResponse, statusResponse] = await Promise.all([
            fetch(`/api/tasks${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
            fetch(`/api/files${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
            fetch("/api/system/status", { cache: "no-store" }),
          ]);

          if (!taskResponse.ok) {
            throw new Error(await readDashboardErrorMessage(taskResponse, "loadTasksFailed"));
          }
          if (!fileResponse.ok) {
            throw new Error(await readDashboardErrorMessage(fileResponse, "loadFilesFailed"));
          }

          const taskJson = (await taskResponse.json()) as { data: TaskRecord[] };
          const fileJson = (await fileResponse.json()) as { data: FileRecord[] };
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
                  files: fileJson.data,
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

  const setDashboardFiles = useCallback(
    (scope: DashboardScope, updater: SetStateAction<FileRecord[]>) => {
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
              files: typeof updater === "function" ? updater(previous.stateByScope[scope].files) : updater,
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
      setDashboardTasks,
      setDashboardFiles,
      setDashboardErrorMessage,
    }),
    [
      ensureDashboardScopeLoaded,
      refreshDashboardScope,
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
    setDashboardTasks,
    setDashboardFiles,
    setDashboardErrorMessage,
  } = context;
  const previewState = useMemo(() => buildPreviewScopeState(scope), [scope]);
  const scopeState = stateByScope[scope];
  const computedLoading = scopeState.loading || (!scopeState.loaded && !scopeState.errorMessage);

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
            ensureLoaded,
            refreshScope,
            setTasks,
            setFiles,
            setErrorMessage,
          }
        : {
            ...scopeState,
            loading: computedLoading,
            ensureLoaded,
            refreshScope,
            setTasks,
            setFiles,
            setErrorMessage,
          },
    [
      computedLoading,
      ensureLoaded,
      isPreview,
      localPreviewErrorMessage,
      previewState,
      refreshScope,
      scopeState,
      setErrorMessage,
      setFiles,
      setTasks,
    ],
  );
}
