import type { Route } from "next";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/domains/auth/types";
import { defaultSafeNextPath, resolveSafeInternalPath } from "@/lib/auth/safe-next-path";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { listProjectsForSession } from "@/use-cases/admin/admin-service";

export async function requireWorkspacePageUser(pathname: string): Promise<AuthUser> {
  const user = await requirePageUser(pathname);
  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access" as Route);
  }

  if (user.accessStatus === "disabled") {
    redirect("/auth/no-access" as Route);
  }

  const selection = await listProjectsForSession(user);

  if (selection.availableProjects.length > 0) {
    return user;
  }

  if (user.role === "admin") {
    redirect("/admin" as Route);
  }

  redirect("/auth/no-access" as Route);
}

export async function resolvePostLoginDestination(user: AuthUser, requestedPath: string | null | undefined) {
  const safeRequestedPath = resolveSafeInternalPath(requestedPath, defaultSafeNextPath);
  if (safeRequestedPath.startsWith("/invitations/accept")) {
    return {
      destination: safeRequestedPath as Route,
      currentProjectId: null,
    };
  }

  if (user.accessStatus === "pending") {
    return {
      destination: "/auth/pending-access" as Route,
      currentProjectId: null,
    };
  }

  if (user.accessStatus === "disabled") {
    return {
      destination: "/auth/no-access" as Route,
      currentProjectId: null,
    };
  }

  const selection = await listProjectsForSession(user);

  if (selection.availableProjects.length === 0) {
    return {
      destination: (user.role === "admin" ? "/admin" : "/auth/no-access") as Route,
      currentProjectId: null,
    };
  }

  return {
    destination: safeRequestedPath,
    currentProjectId: selection.currentProjectId,
  };
}
