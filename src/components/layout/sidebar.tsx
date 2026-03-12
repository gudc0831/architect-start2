"use client";

import type { Route } from "next";
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
          aria-label="프로젝트명"
          className="sidebar__title-input"
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="프로젝트명을 입력하세요"
          value={projectName}
        />
        <p className="sidebar__copy">{isPreview ? "UI preview mode" : "Supabase 기반 협업 작업 관리"}</p>
        <p className="sidebar__status">
          {projectLoaded ? (isSyncing ? "프로젝트명 저장 중" : `프로젝트 메타 ${projectSource ?? "unknown"}`) : "프로젝트 메타 불러오는 중"}
        </p>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <Link className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")} key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar__note">
        {isPreview ? <p>프리뷰 모드: 저장 없이 화면만 확인합니다.</p> : <p>{authUser ? `${authUser.displayName} (${authUser.role})` : "세션 확인 중"}</p>}
        {!isPreview ? <button className="secondary-button" onClick={() => void handleLogout()} type="button">로그아웃</button> : null}
      </div>
    </aside>
  );
}
