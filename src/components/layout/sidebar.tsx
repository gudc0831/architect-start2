"use client";

import clsx from "clsx";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthState, useAuthUser } from "@/providers/auth-provider";
import { useProjectMeta } from "@/providers/project-provider";
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
  const isLocalAuthPlaceholder = authUser?.id === "local-auth-placeholder";
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
    <aside className="sidebar">
      <div className="sidebar__brand">
        <p className="sidebar__eyebrow">{t("brand.appName")}</p>
        {showProjectSwitcher ? (
          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
        {showProjectSwitcher ? (
          <div
            style={{
              display: "grid",
              gap: "0.4rem",
              maxHeight: "9.5rem",
              overflowY: "auto",
            }}
          >
            {availableProjects.map((project) => {
              const isCurrent = project.id === currentProjectId;
              return (
                <button
                  key={project.id}
                  className={isCurrent ? "primary-button" : "secondary-button"}
                  disabled={isCurrent || isSyncing}
                  onClick={() => void switchProject(project.id)}
                  style={{
                    justifyContent: "space-between",
                    minHeight: "2.4rem",
                    fontSize: "0.92rem",
                    paddingInline: "0.8rem",
                  }}
                  type="button"
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                  <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>{isCurrent ? "Current" : "Open"}</span>
                </button>
              );
            })}
          </div>
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
          <p className="sidebar__status">{sourceLabel}</p>
          {showProjectSwitcher && selectedProject ? (
            <p className="sidebar__status" style={{ opacity: 0.85 }}>
              {availableProjects.length} projects, viewing {selectedProject.name}
            </p>
          ) : null}
        </div>
      </div>

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

      <div className={clsx("sidebar__note", isPreview && "sidebar__note--preview")}>
        {isPreview ? (
          <p>{t("sidebar.previewNote")}</p>
        ) : (
          <p>{authUser ? `${authUser.displayName} (${labelForRole(authUser.role)})` : t("sidebar.checkingSession")}</p>
        )}
        {isLocalAuthPlaceholder && !isPreview ? <p>{t("sidebar.localAuthNote")}</p> : null}
        {!isPreview ? (
          <button className="secondary-button" onClick={() => void handleLogout()} type="button">
            {t("actions.logout")}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
