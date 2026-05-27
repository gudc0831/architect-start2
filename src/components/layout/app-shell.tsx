"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { ProjectProvider, useProjectMeta } from "@/providers/project-provider";
import { DashboardProvider } from "@/providers/dashboard-provider";
import { useAuthState } from "@/providers/auth-provider";
import { ProjectShell } from "@/components/layout/project-shell";
import { t } from "@/lib/ui-copy";

function buildLoginRedirect(pathname: string) {
  const params = new URLSearchParams();
  if (pathname && pathname !== "/") {
    params.set("next", pathname);
  }
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

function WorkspaceAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPreview = pathname.startsWith("/preview");
  const isPublicShellPath = pathname === "/login" || pathname.startsWith("/auth/");
  const isWorkspacePath = pathname === "/board" || pathname === "/daily" || pathname === "/calendar" || pathname === "/trash";
  const { user, loading } = useAuthState();
  const { availableProjects, projectLoaded } = useProjectMeta();

  useEffect(() => {
    if (isPreview || isPublicShellPath || loading) {
      return;
    }

    if (!user) {
      router.replace(buildLoginRedirect(pathname) as Route);
      return;
    }

    if (user.accessStatus === "pending") {
      router.replace("/auth/pending-access");
      return;
    }

    if (user.accessStatus === "disabled") {
      router.replace("/auth/no-access");
      return;
    }

    if (projectLoaded && isWorkspacePath && availableProjects.length === 0) {
      router.replace(user.role === "admin" ? "/admin" : "/auth/no-access");
    }
  }, [availableProjects.length, isPreview, isPublicShellPath, isWorkspacePath, loading, pathname, projectLoaded, router, user]);

  if (!isPreview && !isPublicShellPath && (loading || !user || user.accessStatus !== "active")) {
    return (
      <div className="empty-state">
        <h3>{t("workspace.loading")}</h3>
      </div>
    );
  }

  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const contentWidth = pathname === "/daily" || pathname === "/preview/daily" ? "wide" : "default";

  if (pathname === "/login" || pathname.startsWith("/auth/")) {
    return <>{children}</>;
  }

  return (
    <ProjectProvider>
      <DashboardProvider>
        <WorkspaceAccessGate>
          <ProjectShell contentWidth={contentWidth}>{children}</ProjectShell>
        </WorkspaceAccessGate>
      </DashboardProvider>
    </ProjectProvider>
  );
}
