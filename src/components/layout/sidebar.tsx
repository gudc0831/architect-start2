"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useProjectMeta } from "@/providers/project-provider";
import { useAuthState, useAuthUser } from "@/providers/auth-provider";

const items = [
  { href: "/board", label: "Board" },
  { href: "/daily", label: "Daily List" },
  { href: "/calendar", label: "Calendar" },
  { href: "/trash", label: "Trash" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const authUser = useAuthUser();
  const { clearUser } = useAuthState();
  const { projectName, setProjectName, projectLoaded, projectSource, isSyncing } = useProjectMeta();
  const navItems = items.map((item) => ({
    ...item,
    href: (isPreview ? `/preview${item.href}` : item.href) as Route,
  }));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearUser();
    window.location.assign("/login");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <p className="sidebar__eyebrow">Architect Start</p>
        <input
          aria-label="Project name"
          className="sidebar__title-input"
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Enter a project name"
          value={projectName}
        />
        <p className="sidebar__copy">
          {isPreview ? "Preview mode for responsive QA." : "Task tracking workspace for board, daily, calendar, and archive views."}
        </p>
        <p className="sidebar__status">
          {projectLoaded ? (isSyncing ? "Syncing project metadata..." : `Project metadata: ${projectSource ?? "unknown"}`) : "Loading project metadata..."}
        </p>
      </div>

      <nav aria-label="Primary" className="sidebar__nav">
        {navItems.map((item) => (
          <Link className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")} key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar__note">
        {isPreview ? <p>Preview mode uses demo data and disables mutations.</p> : <p>{authUser ? `${authUser.displayName} (${authUser.role})` : "Checking session..."}</p>}
        {!isPreview ? (
          <button className="secondary-button" onClick={() => void handleLogout()} type="button">
            Log out
          </button>
        ) : null}
      </div>
    </aside>
  );
}
