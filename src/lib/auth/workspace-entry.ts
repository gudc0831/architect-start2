import type { Route } from "next";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/domains/auth/types";
import { defaultSafeNextPath, resolveSafeInternalPath } from "@/lib/auth/safe-next-path";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { listProjectsForSession } from "@/use-cases/admin/admin-service";

export async function requireWorkspacePageUser(pathname: string): Promise<AuthUser> {
  const user = await requirePageUser(pathname);
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
  const selection = await listProjectsForSession(user);

  if (selection.availableProjects.length === 0) {
    return {
      destination: (user.role === "admin" ? "/admin" : "/auth/no-access") as Route,
      currentProjectId: null,
    };
  }

  return {
    destination: resolveSafeInternalPath(requestedPath, defaultSafeNextPath),
    currentProjectId: selection.currentProjectId,
  };
}
