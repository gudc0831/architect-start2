"use client";

import clsx from "clsx";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSelector } from "@/components/layout/theme-selector";
import { useAuthState, useAuthUser } from "@/providers/auth-provider";
import { useProjectMeta } from "@/providers/project-provider";
import { useTheme } from "@/providers/theme-provider";
import { labelForMode, labelForProjectSource, labelForRole, t } from "@/lib/ui-copy";

const items = [
  { href: "/board", mode: "board" },
  { href: "/daily", mode: "daily" },
  { href: "/calendar", mode: "calendar" },
  { href: "/trash", mode: "trash" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const authUser = useAuthUser();
  const { themeId } = useTheme();
  const isLocalAuthPlaceholder = authUser?.id === "local-auth-placeholder";
  const isWarmStudio = themeId === "posthog";
  const { clearUser } = useAuthState();
  const { currentProjectId, availableProjects, switchProject, projectName, projectLoaded, projectSource, isSyncing } = useProjectMeta();
  const navItems = items.map((item) => ({
    ...item,
    label: labelForMode(item.mode),
    href: (isPreview ? `/preview${item.href}` : item.href) as Route,
  }));
  const adminHref = (isPreview ? "/preview/board" : "/admin") as Route;
  const selectedProject = availableProjects.find((project) => project.id === currentProjectId) ?? null;
  const showProjectSwitcher = availableProjects.length > 1;
  const navSectionLabel = isPreview ? "Preview routes" : "Workspace routes";
  const sessionSectionLabel = isPreview ? "Safe preview" : "Session";

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
              Projects
            </span>
            <select
              aria-label="Select current project"
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
            <span className="sidebar__project-label">Current project</span>
            {showProjectSwitcher ? <span className="sidebar__project-count">{availableProjects.length}</span> : null}
          </div>
          <div className="sidebar__project-name">{projectName}</div>
          {!isPreview && authUser?.role === "admin" ? (
            <Link className="secondary-button" href={adminHref}>
              Manage projects
            </Link>
          ) : null}
        </div>
        <div className="sidebar__brand-meta">
          <p className="sidebar__copy">{isPreview ? t("sidebar.previewCopy") : t("sidebar.workspaceCopy")}</p>
          {isWarmStudio ? (
            <div className="sidebar__status-stack">
              <span className={clsx("sidebar__status-pill", isPreview && "sidebar__status-pill--preview")}>{isPreview ? "Preview" : "Workspace"}</span>
              <span className="sidebar__status-pill">{projectLoaded ? (isSyncing ? t("system.syncing") : labelForProjectSource(projectSource)) : t("system.loading")}</span>
            </div>
          ) : null}
          <p className="sidebar__status">{sourceLabel}</p>
          {showProjectSwitcher && selectedProject ? (
            <p className="sidebar__status" style={{ opacity: 0.85 }}>
              {availableProjects.length} projects, viewing {selectedProject.name}
            </p>
          ) : null}
        </div>
      </div>

      {isWarmStudio ? (
        <div className="sidebar__section">
          <p className="sidebar__section-label">{navSectionLabel}</p>
          <nav aria-label={t("brand.primaryNavAriaLabel")} className="sidebar__nav">
            {navItems.map((item, index) => (
              <Link className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")} key={item.href} href={item.href}>
                <span aria-hidden="true" className="sidebar__link-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="sidebar__link-label">{item.label}</span>
              </Link>
            ))}
            {!isPreview && authUser?.role === "admin" ? (
              <Link className={clsx("sidebar__link", pathname === adminHref && "sidebar__link--active")} href={adminHref}>
                <span aria-hidden="true" className="sidebar__link-index">99</span>
                <span className="sidebar__link-label">Admin</span>
              </Link>
            ) : null}
          </nav>
        </div>
      ) : (
        <nav aria-label={t("brand.primaryNavAriaLabel")} className="sidebar__nav">
          {navItems.map((item) => (
            <Link className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")} key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          {!isPreview && authUser?.role === "admin" ? (
            <Link className={clsx("sidebar__link", pathname === adminHref && "sidebar__link--active")} href={adminHref}>
              Admin
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
