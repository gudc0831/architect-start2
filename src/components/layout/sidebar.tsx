"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeSelector } from "@/components/layout/theme-selector";
import { useAuthState, useAuthUser } from "@/providers/auth-provider";
import { useDashboardData, type DashboardScope } from "@/providers/dashboard-provider";
import { useProjectMeta } from "@/providers/project-provider";
import { useTheme } from "@/providers/theme-provider";
import { labelForMode, labelForProjectSource, labelForRole, t } from "@/lib/ui-copy";

const items = [
  { href: "/board", mode: "board" },
  { href: "/daily", mode: "daily" },
  { href: "/calendar", mode: "calendar" },
  { href: "/trash", mode: "trash" },
] as const;

type SidebarIdleHandle =
  | {
      kind: "idle";
      id: number;
    }
  | {
      kind: "timeout";
      id: number;
    };

function scheduleSidebarIdleWork(callback: () => void, timeout = 2000): SidebarIdleHandle | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (typeof window.requestIdleCallback === "function") {
    return {
      kind: "idle",
      id: window.requestIdleCallback(callback, { timeout }),
    };
  }

  return {
    kind: "timeout",
    id: window.setTimeout(callback, 250),
  };
}

function cancelSidebarIdleWork(handle: SidebarIdleHandle | null) {
  if (!handle || typeof window === "undefined") {
    return;
  }

  if (handle.kind === "idle" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle.id);
    return;
  }

  window.clearTimeout(handle.id);
}

function scopeForMode(mode: (typeof items)[number]["mode"]): DashboardScope {
  return mode === "trash" ? "trash" : "active";
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const isPreview = pathname.startsWith("/preview");
  const authUser = useAuthUser();
  const { themeId } = useTheme();
  const isLocalAuthPlaceholder = authUser?.id === "local-auth-placeholder";
  const isWarmStudio = themeId === "posthog";
  const { clearUser } = useAuthState();
  const { ensureDashboardScopeLoaded } = useDashboardData();
  const { currentProjectId, availableProjects, switchProject, projectName, projectLoaded, projectSource, isSyncing } = useProjectMeta();
  const navItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        label: labelForMode(item.mode),
        href: (isPreview ? `/preview${item.href}` : item.href) as Route,
      })),
    [isPreview],
  );
  const adminHref = (isPreview ? "/preview/board" : "/admin") as Route;
  const selectedProject = availableProjects.find((project) => project.id === currentProjectId) ?? null;
  const showProjectSwitcher = availableProjects.length > 1;
  const navSectionLabel = isPreview ? "미리보기 경로" : "작업공간 경로";
  const sessionSectionLabel = isPreview ? "안전 미리보기" : "세션";

  const warmWorkspaceNavigation = useCallback(
    (href: Route, mode: (typeof items)[number]["mode"]) => {
      router.prefetch(href);

      if (isPreview || !projectLoaded || !currentProjectId) {
        return;
      }

      void ensureDashboardScopeLoaded(scopeForMode(mode)).catch(() => undefined);
    },
    [currentProjectId, ensureDashboardScopeLoaded, isPreview, projectLoaded, router],
  );

  useEffect(() => {
    if (isPreview || !projectLoaded || !currentProjectId) {
      return;
    }

    const handle = scheduleSidebarIdleWork(() => {
      navItems
        .filter((item) => item.mode !== "trash")
        .forEach((item) => {
          router.prefetch(item.href);
        });
      void ensureDashboardScopeLoaded("active").catch(() => undefined);
    });

    return () => cancelSidebarIdleWork(handle);
  }, [currentProjectId, ensureDashboardScopeLoaded, isPreview, navItems, projectLoaded, router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearUser();
    window.location.assign("/login");
  }

  const sourceLabel = projectLoaded
    ? isSyncing
      ? t("sidebar.projectMetadataSyncing")
      : t("sidebar.projectMetadataValue", { source: labelForProjectSource(projectSource) })
    : t("sidebar.projectMetadataLoading");

  return (
    <aside className={clsx("sidebar", isWarmStudio && "sidebar--posthog")}>
      <div className="sidebar__brand">
        <p className="sidebar__eyebrow">{t("brand.appName")}</p>
        {showProjectSwitcher ? (
          <label className={isWarmStudio ? "sidebar__switcher" : undefined} style={isWarmStudio ? undefined : { display: "grid", gap: "0.4rem" }}>
            <span
              className={isWarmStudio ? "sidebar__section-label sidebar__section-label--compact" : undefined}
              style={isWarmStudio ? undefined : { fontSize: "0.78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              프로젝트
            </span>
            <select
              aria-label="현재 프로젝트 선택"
              className="sidebar__title-input"
              disabled={isSyncing}
              onChange={(event) => void switchProject(event.target.value)}
              value={currentProjectId ?? ""}
            >
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="sidebar__project-panel">
          <div className="sidebar__project-heading">
            <span className="sidebar__project-label">현재 프로젝트</span>
            {showProjectSwitcher ? <span className="sidebar__project-count">{availableProjects.length}</span> : null}
          </div>
          <div className="sidebar__project-name">{projectName}</div>
          {!isPreview && authUser?.role === "admin" ? (
            <Link className="secondary-button" href={adminHref}>
              프로젝트 관리
            </Link>
          ) : null}
        </div>
        <div className="sidebar__brand-meta">
          <p className="sidebar__copy">{isPreview ? t("sidebar.previewCopy") : t("sidebar.workspaceCopy")}</p>
          {isWarmStudio ? (
            <div className="sidebar__status-stack">
              <span className={clsx("sidebar__status-pill", isPreview && "sidebar__status-pill--preview")}>{isPreview ? "프리뷰" : "작업공간"}</span>
              <span className="sidebar__status-pill">{projectLoaded ? (isSyncing ? t("system.syncing") : labelForProjectSource(projectSource)) : t("system.loading")}</span>
            </div>
          ) : null}
          <p className="sidebar__status">{sourceLabel}</p>
          {showProjectSwitcher && selectedProject ? (
            <p className="sidebar__status" style={{ opacity: 0.85 }}>
              프로젝트 {availableProjects.length}개, 현재 {selectedProject.name} 보기
            </p>
          ) : null}
        </div>
      </div>

      {isWarmStudio ? (
        <div className="sidebar__section">
          <p className="sidebar__section-label">{navSectionLabel}</p>
          <nav aria-label={t("brand.primaryNavAriaLabel")} className="sidebar__nav">
            {navItems.map((item, index) => (
              <Link
                className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")}
                key={item.href}
                href={item.href}
                onFocus={() => warmWorkspaceNavigation(item.href, item.mode)}
                onMouseEnter={() => warmWorkspaceNavigation(item.href, item.mode)}
              >
                <span aria-hidden="true" className="sidebar__link-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="sidebar__link-label">{item.label}</span>
              </Link>
            ))}
            {!isPreview && authUser?.role === "admin" ? (
              <Link className={clsx("sidebar__link", pathname === adminHref && "sidebar__link--active")} href={adminHref}>
                <span aria-hidden="true" className="sidebar__link-index">99</span>
                <span className="sidebar__link-label">관리자</span>
              </Link>
            ) : null}
          </nav>
        </div>
      ) : (
        <nav aria-label={t("brand.primaryNavAriaLabel")} className="sidebar__nav">
          {navItems.map((item) => (
            <Link
              className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")}
              key={item.href}
              href={item.href}
              onFocus={() => warmWorkspaceNavigation(item.href, item.mode)}
              onMouseEnter={() => warmWorkspaceNavigation(item.href, item.mode)}
            >
              {item.label}
            </Link>
          ))}
          {!isPreview && authUser?.role === "admin" ? (
            <Link className={clsx("sidebar__link", pathname === adminHref && "sidebar__link--active")} href={adminHref}>
              관리자
            </Link>
          ) : null}
        </nav>
      )}

      <div className={clsx("sidebar__note", isPreview && "sidebar__note--preview")}>
        {isWarmStudio ? <p className="sidebar__section-label sidebar__section-label--compact">{sessionSectionLabel}</p> : null}
        {isPreview ? (
          <p>{t("sidebar.previewNote")}</p>
        ) : (
          <p>{authUser ? `${authUser.displayName} (${labelForRole(authUser.role)})` : t("sidebar.checkingSession")}</p>
        )}
        {isLocalAuthPlaceholder && !isPreview ? <p>{t("sidebar.localAuthNote")}</p> : null}
        {!isPreview ? (
          <>
            <ThemeSelector />
            <button className="secondary-button" onClick={() => void handleLogout()} type="button">
              {t("actions.logout")}
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
