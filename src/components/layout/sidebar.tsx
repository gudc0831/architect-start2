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
  const { currentProjectId, availableProjects, switchProject, projectName, setProjectName, projectLoaded, projectSource, isSyncing } =
    useProjectMeta();
  const navItems = items.map((item) => ({
    ...item,
    label: labelForMode(item.mode),
    href: (isPreview ? `/preview${item.href}` : item.href) as Route,
  }));
  const adminHref = (isPreview ? "/preview/board" : "/admin") as Route;

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
        {!isPreview && availableProjects.length > 0 ? (
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
        ) : null}
        <input
          aria-label={t("sidebar.projectNameAriaLabel")}
          className="sidebar__title-input"
          onChange={(event) => setProjectName(event.target.value)}
          placeholder={t("sidebar.projectNamePlaceholder")}
          value={projectName}
        />
        <div className="sidebar__brand-meta">
          <p className="sidebar__copy">{isPreview ? t("sidebar.previewCopy") : t("sidebar.workspaceCopy")}</p>
          <p className="sidebar__status">{sourceLabel}</p>
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
        {isPreview ? <p>{t("sidebar.previewNote")}</p> : <p>{authUser ? `${authUser.displayName} (${labelForRole(authUser.role)})` : t("sidebar.checkingSession")}</p>}
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
