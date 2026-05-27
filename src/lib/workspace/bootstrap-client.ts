import type { WorkspaceBootstrapPayload } from "@/lib/workspace/bootstrap-types";

type WorkspaceBootstrapOrderScope = "daily" | null;

const workspaceBootstrapPromises = new Map<string, Promise<WorkspaceBootstrapPayload>>();

function shouldRetryWorkspaceBootstrap(status: number) {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function waitForWorkspaceBootstrapRetry(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function readWorkspaceBootstrapResponse(response: Response): Promise<WorkspaceBootstrapPayload> {
  const json = (await response.json().catch(() => ({}))) as {
    data?: WorkspaceBootstrapPayload;
    error?: { message?: string };
  };

  if (!response.ok || !json.data) {
    throw new Error(json.error?.message ?? "Workspace bootstrap failed");
  }

  return json.data;
}

function buildWorkspaceBootstrapUrl(orderScope: WorkspaceBootstrapOrderScope) {
  return orderScope === "daily" ? "/api/workspace/bootstrap?orderScope=daily" : "/api/workspace/bootstrap";
}

async function requestWorkspaceBootstrap(orderScope: WorkspaceBootstrapOrderScope): Promise<WorkspaceBootstrapPayload> {
  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(buildWorkspaceBootstrapUrl(orderScope), { cache: "no-store" });
      if (response.ok || !shouldRetryWorkspaceBootstrap(response.status) || attempt === maxAttempts) {
        return readWorkspaceBootstrapResponse(response);
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await waitForWorkspaceBootstrapRetry(250 * attempt);
  }

  throw lastError instanceof Error ? lastError : new Error("Workspace bootstrap failed");
}

export async function fetchWorkspaceBootstrap(orderScope: WorkspaceBootstrapOrderScope = null): Promise<WorkspaceBootstrapPayload> {
  const cacheKey = orderScope ?? "default";
  let workspaceBootstrapPromise = workspaceBootstrapPromises.get(cacheKey);
  if (!workspaceBootstrapPromise) {
    workspaceBootstrapPromise = requestWorkspaceBootstrap(orderScope).catch((error) => {
      workspaceBootstrapPromises.delete(cacheKey);
      throw error;
    });
    workspaceBootstrapPromises.set(cacheKey, workspaceBootstrapPromise);
  }

  return workspaceBootstrapPromise;
}

export function clearWorkspaceBootstrapCache() {
  workspaceBootstrapPromises.clear();
}

export function isWorkspaceBootstrapPath(pathname: string) {
  return pathname === "/daily" || pathname === "/board" || pathname === "/calendar" || pathname === "/trash";
}
