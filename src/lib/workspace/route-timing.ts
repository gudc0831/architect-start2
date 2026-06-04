"use client";

import type { DashboardMode } from "@/domains/task/types";

export type WorkspaceRouteMode = DashboardMode | "admin";

type WorkspaceRouteTransitionStart = {
  fromPathname: string;
  href: string;
  startedAt: number;
  targetMode: WorkspaceRouteMode;
};

export type WorkspaceRouteReadyTiming = {
  elapsedMs: number | null;
  fileCount: number;
  fromPathname: string | null;
  hasError: boolean;
  href: string | null;
  mode: WorkspaceRouteMode;
  pathname: string;
  readyAt: number;
  taskCount: number;
};

declare global {
  interface Window {
    __architectRouteTransitionStart?: WorkspaceRouteTransitionStart;
    __architectWorkspaceReady?: WorkspaceRouteReadyTiming;
    __architectWorkspaceTimings?: WorkspaceRouteReadyTiming[];
  }
}

function now() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function markWorkspaceRouteTransition(
  targetMode: WorkspaceRouteMode,
  href: string,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.__architectRouteTransitionStart = {
    fromPathname: window.location.pathname,
    href,
    startedAt: now(),
    targetMode,
  };
}

export function recordWorkspaceRouteReady(input: {
  fileCount: number;
  hasError: boolean;
  mode: WorkspaceRouteMode;
  pathname: string;
  taskCount: number;
}) {
  if (typeof window === "undefined") {
    return null;
  }

  const readyAt = now();
  const start = window.__architectRouteTransitionStart;
  const elapsedMs =
    start && start.targetMode === input.mode
      ? Math.max(0, readyAt - start.startedAt)
      : null;
  const timing: WorkspaceRouteReadyTiming = {
    elapsedMs,
    fileCount: input.fileCount,
    fromPathname: start?.fromPathname ?? null,
    hasError: input.hasError,
    href: start?.href ?? null,
    mode: input.mode,
    pathname: input.pathname,
    readyAt,
    taskCount: input.taskCount,
  };

  window.__architectWorkspaceReady = timing;
  window.__architectWorkspaceTimings = [
    ...(window.__architectWorkspaceTimings ?? []).slice(-39),
    timing,
  ];
  window.document.documentElement.dataset.architectWorkspaceMode = timing.mode;
  window.document.documentElement.dataset.architectWorkspacePathname =
    timing.pathname;
  window.document.documentElement.dataset.architectWorkspaceElapsedMs =
    timing.elapsedMs === null ? "" : timing.elapsedMs.toFixed(1);
  window.document.documentElement.dataset.architectWorkspaceTaskCount = String(
    timing.taskCount,
  );
  window.document.documentElement.dataset.architectWorkspaceFileCount = String(
    timing.fileCount,
  );
  window.document.documentElement.dataset.architectWorkspaceHasError =
    timing.hasError ? "true" : "false";
  return timing;
}
