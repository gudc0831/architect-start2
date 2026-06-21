"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo } from "react";
import type { FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeSelector } from "@/components/layout/theme-selector";
import { useAuthState, useAuthUser } from "@/providers/auth-provider";
import { useDashboardData, type DashboardScope } from "@/providers/dashboard-provider";
import { useProjectMeta } from "@/providers/project-provider";
import { useTheme } from "@/providers/theme-provider";
import { canManageProjectMembers } from "@/lib/auth/project-capabilities";
import { labelForMode, labelForProjectSource, labelForRole, t } from "@/lib/ui-copy";
import { fetchWorkspaceDailyTaskUserOrders } from "@/lib/workspace/bootstrap-client";
import { markWorkspaceRouteTransition } from "@/lib/workspace/route-timing";

const items = [
  { href: "/board", mode: "board" },
  { href: "/daily", mode: "daily" },
  { href: "/calendar", mode: "calendar" },
  { href: "/materials", mode: "materials" },
  { href: "/trash", mode: "trash" },
] as const;

type WorkspaceNavMode = (typeof items)[number]["mode"];

type SidebarIdleHandle =
  | {
      kind: "idle";
      id: number;
    }
  | {
      kind: "timeout";
      id: number;
    };

type SidebarProps = {
  isExpanded: boolean;
  isPinned: boolean;
  onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
  onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
  onHandleClick: () => void;
  onPinToggle: () => void;
  onPointerEnter: () => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
};

function scheduleSidebarIdleWork(callback: () => void, timeout = 500): SidebarIdleHandle | null {
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
    id: window.setTimeout(callback, 80),
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

function scopeForMode(mode: (typeof items)[number]["mode"]): DashboardScope | null {
  if (mode === "materials") {
    return null;
  }

  return mode === "trash" ? "trash" : "active";
}

export function Sidebar({
  isExpanded,
  isPinned,
  onBlur,
  onFocus,
  onHandleClick,
  onPinToggle,
  onPointerEnter,
  onPointerLeave,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isPreview = pathname.startsWith("/preview");
  const authUser = useAuthUser();
  const { themeId } = useTheme();
  const isLocalAuthPlaceholder = authUser?.id === "local-auth-placeholder";
  const isWarmStudio = themeId === "posthog";
  const isAppleWorkbench = themeId === "apple-workbench";
  const { clearUser } = useAuthState();
  const { ensureDashboardScopeLoaded } = useDashboardData();
  const { currentProjectId, currentProjectRole, availableProjects, switchProject, projectName, projectLoaded, projectSource, isSyncing } = useProjectMeta();
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
  const aiSettingsHref = "/ai-settings" as Route;
  const canShowProjectAdminLink =
    !isPreview &&
    Boolean(authUser) &&
    authUser?.accessStatus === "active" &&
    canManageProjectMembers({
      globalRole: authUser?.role ?? "member",
      projectRole: currentProjectRole,
    });
  const selectedProject = availableProjects.find((project) => project.id === currentProjectId) ?? null;
  const showProjectSwitcher = availableProjects.length > 1;
  const navSectionLabel = isPreview ? "미리보기 경로" : "작업공간 경로";
  const sessionSectionLabel = isPreview ? "안전 미리보기" : "세션";

  const warmWorkspaceNavigation = useCallback(
    (href: Route, mode: WorkspaceNavMode) => {
      router.prefetch(href);

      if (isPreview || !projectLoaded || !currentProjectId) {
        return;
      }

      const scope = scopeForMode(mode);
      if (!scope) {
        return;
      }

      void ensureDashboardScopeLoaded(scope)
        .then(() => {
          if (mode === "daily") {
            return fetchWorkspaceDailyTaskUserOrders();
          }
          return undefined;
        })
        .catch(() => undefined);
    },
    [currentProjectId, ensureDashboardScopeLoaded, isPreview, projectLoaded, router],
  );
  const prefetchWorkspaceRoute = useCallback(
    (href: Route) => {
      router.prefetch(href);
    },
    [router],
  );
  const navigateWorkspaceRoute = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, mode: WorkspaceNavMode, href: Route) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const targetHref = String(href);
      markWorkspaceRouteTransition(mode, targetHref);

      event.preventDefault();
      const targetUrl = new URL(targetHref, window.location.href);
      const targetPath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentPath !== targetPath) {
        window.history.pushState(window.history.state, "", targetPath);
        window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      }
    },
    [],
  );

  const warmAdminNavigation = useCallback(() => {
    if (!isPreview) {
      router.prefetch(adminHref);
    }
  }, [adminHref, isPreview, router]);

  const warmAiSettingsNavigation = useCallback(() => {
    if (!isPreview) {
      router.prefetch(aiSettingsHref);
    }
  }, [aiSettingsHref, isPreview, router]);

  useEffect(() => {
    if (isPreview || !projectLoaded || !currentProjectId) {
      return;
    }

    const handle = scheduleSidebarIdleWork(() => {
      navItems.forEach((item) => {
        router.prefetch(item.href);
      });
      warmAdminNavigation();
      warmAiSettingsNavigation();
      void ensureDashboardScopeLoaded("active")
        .then(() => fetchWorkspaceDailyTaskUserOrders())
        .catch(() => undefined);
      void ensureDashboardScopeLoaded("trash").catch(() => undefined);
    });

    return () => cancelSidebarIdleWork(handle);
  }, [currentProjectId, ensureDashboardScopeLoaded, isPreview, navItems, projectLoaded, router, warmAdminNavigation, warmAiSettingsNavigation]);

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
  const sidebarHandleLabel = isExpanded ? "사이드바 닫기" : "사이드바 열기";
  const sidebarPinLabel = isPinned ? "사이드바 고정 해제" : "사이드바 고정";

  return (
    <aside
      className={clsx(
        "sidebar",
        isWarmStudio && "sidebar--posthog",
        isExpanded ? "sidebar--expanded" : "sidebar--collapsed",
        isPinned && "sidebar--pinned",
      )}
      onBlurCapture={onBlur}
      onFocusCapture={onFocus}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {!isExpanded ? (
        <button
          aria-controls="workspace-sidebar-surface"
          aria-expanded={isExpanded}
          aria-label={sidebarHandleLabel}
          className="sidebar__handle"
          data-workspace-navigation="true"
          onClick={onHandleClick}
          type="button"
        >
          <span aria-hidden="true" className="sidebar__handle-bars">
            <span />
            <span />
            <span />
          </span>
          <span className="sidebar__handle-text">메뉴</span>
        </button>
      ) : null}

      <div className="sidebar__dock-actions">
        <button
          aria-label={sidebarPinLabel}
          aria-pressed={isPinned}
          className={clsx("sidebar__pin-button", isPinned && "sidebar__pin-button--active")}
          data-workspace-navigation="true"
          onClick={onPinToggle}
          type="button"
        >
          <SidebarPinIcon />
        </button>
      </div>

      <div className="sidebar__surface" id="workspace-sidebar-surface">
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
            {canShowProjectAdminLink ? (
              <Link className="secondary-button" href={adminHref}>
                프로젝트 관리
              </Link>
            ) : null}
          </div>
          {!isAppleWorkbench ? (
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
          ) : null}
        </div>

        {isWarmStudio ? (
          <div className="sidebar__section">
            <p className="sidebar__section-label">{navSectionLabel}</p>
            <nav aria-label={t("brand.primaryNavAriaLabel")} className="sidebar__nav" data-workspace-navigation="true">
              {navItems.map((item, index) => (
                <Link
                  className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")}
                  key={item.href}
                  href={item.href}
                  onClick={(event) => navigateWorkspaceRoute(event, item.mode, item.href)}
                  onFocus={() => warmWorkspaceNavigation(item.href, item.mode)}
                  onMouseEnter={() => warmWorkspaceNavigation(item.href, item.mode)}
                  onPointerDownCapture={() => prefetchWorkspaceRoute(item.href)}
                >
                  <span aria-hidden="true" className="sidebar__link-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="sidebar__link-label">{item.label}</span>
                </Link>
              ))}
              {!isPreview && authUser?.accessStatus === "active" ? (
                <Link
                  className={clsx("sidebar__link", pathname === aiSettingsHref && "sidebar__link--active")}
                  href={aiSettingsHref}
                  onFocus={warmAiSettingsNavigation}
                  onMouseEnter={warmAiSettingsNavigation}
                  onPointerDownCapture={warmAiSettingsNavigation}
                >
                  <span aria-hidden="true" className="sidebar__link-index">06</span>
                  <span className="sidebar__link-label">AI 설정</span>
                </Link>
              ) : null}
              {!isPreview && authUser?.accessStatus === "active" && authUser.role === "admin" ? (
                <Link
                  className={clsx("sidebar__link", pathname === adminHref && "sidebar__link--active")}
                  href={adminHref}
                  onClickCapture={() => markWorkspaceRouteTransition("admin", adminHref)}
                  onFocus={warmAdminNavigation}
                  onMouseEnter={warmAdminNavigation}
                  onPointerDownCapture={warmAdminNavigation}
                >
                  <span aria-hidden="true" className="sidebar__link-index">99</span>
                  <span className="sidebar__link-label">관리자</span>
                </Link>
              ) : null}
            </nav>
          </div>
        ) : (
          <nav aria-label={t("brand.primaryNavAriaLabel")} className="sidebar__nav" data-workspace-navigation="true">
            {navItems.map((item) => (
              <Link
                className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")}
                key={item.href}
                href={item.href}
                onClick={(event) => navigateWorkspaceRoute(event, item.mode, item.href)}
                onFocus={() => warmWorkspaceNavigation(item.href, item.mode)}
                onMouseEnter={() => warmWorkspaceNavigation(item.href, item.mode)}
                onPointerDownCapture={() => prefetchWorkspaceRoute(item.href)}
              >
                {item.label}
              </Link>
            ))}
            {!isPreview && authUser?.accessStatus === "active" ? (
              <Link
                className={clsx("sidebar__link", pathname === aiSettingsHref && "sidebar__link--active")}
                href={aiSettingsHref}
                onFocus={warmAiSettingsNavigation}
                onMouseEnter={warmAiSettingsNavigation}
                onPointerDownCapture={warmAiSettingsNavigation}
              >
                AI 설정
              </Link>
            ) : null}
            {!isPreview && authUser?.accessStatus === "active" && authUser.role === "admin" ? (
              <Link
                className={clsx("sidebar__link", pathname === adminHref && "sidebar__link--active")}
                href={adminHref}
                onClickCapture={() => markWorkspaceRouteTransition("admin", adminHref)}
                onFocus={warmAdminNavigation}
                onMouseEnter={warmAdminNavigation}
                onPointerDownCapture={warmAdminNavigation}
              >
                관리자
              </Link>
            ) : null}
          </nav>
        )}

        <div className={clsx("sidebar__note", isPreview && "sidebar__note--preview")}>
          {!isAppleWorkbench && isWarmStudio ? <p className="sidebar__section-label sidebar__section-label--compact">{sessionSectionLabel}</p> : null}
          {!isAppleWorkbench ? (
            isPreview ? (
              <p>{t("sidebar.previewNote")}</p>
            ) : (
              <p>{authUser ? `${authUser.displayName} (${labelForRole(authUser.role)})` : t("sidebar.checkingSession")}</p>
            )
          ) : null}
          {!isAppleWorkbench && isLocalAuthPlaceholder && !isPreview ? <p>{t("sidebar.localAuthNote")}</p> : null}
          {!isPreview ? (
            <>
              <ThemeSelector />
              <button className="secondary-button" onClick={() => void handleLogout()} type="button">
                {t("actions.logout")}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function SidebarPinIcon() {
  return (
    <svg aria-hidden="true" className="sidebar__pin-icon" fill="none" height="14" viewBox="0 0 24 24" width="14">
      <path d="M9 4h6l-1.5 4v3l2 2v1H8.5V13l2-2V8L9 4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M12 14v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}
