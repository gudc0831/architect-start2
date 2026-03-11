"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useProjectMeta } from "@/providers/project-provider";
import { useAuthState, useAuthUser } from "@/providers/auth-provider";

const items = [
  { href: "/board", label: "보드" },
  { href: "/daily", label: "작업목록(일별)" },
  { href: "/calendar", label: "작업목록(월별)" },
  { href: "/trash", label: "휴지통" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const authUser = useAuthUser();
  const { clearUser } = useAuthState();
  const { projectName, setProjectName, projectLoaded, projectSource, isSyncing } = useProjectMeta();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearUser();
    window.location.assign("/login");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <p className="sidebar__eyebrow">Architect Start</p>
        <input aria-label="프로젝트명" className="sidebar__title-input" onChange={(event) => setProjectName(event.target.value)} placeholder="프로젝트명을 입력하세요" value={projectName} />
        <p className="sidebar__copy">Supabase 기반 협업 작업 관리</p>
        <p className="sidebar__status">{projectLoaded ? (isSyncing ? "프로젝트명 저장 중" : `프로젝트 메타 ${projectSource ?? "unknown"}`) : "프로젝트 메타 불러오는 중"}</p>
      </div>

      <nav className="sidebar__nav">
        {items.map((item) => (
          <Link className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")} key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar__note">
        <p>{authUser ? `${authUser.displayName} (${authUser.role})` : "세션 확인 중"}</p>
        <button className="secondary-button" onClick={() => void handleLogout()} type="button">로그아웃</button>
      </div>
    </aside>
  );
}