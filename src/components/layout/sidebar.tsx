"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useProjectMeta } from "@/providers/project-provider";

const items = [
  { href: "/board", label: "보드" },
  { href: "/daily", label: "작업목록(일별)" },
  { href: "/calendar", label: "작업목록(월별)" },
  { href: "/trash", label: "휴지통" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { projectName, setProjectName, projectLoaded, projectSource, isSyncing } = useProjectMeta();

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <p className="sidebar__eyebrow">아키텍트 스타트</p>
        <input
          aria-label="프로젝트명"
          className="sidebar__title-input"
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="프로젝트명을 입력하세요"
          value={projectName}
        />
        <p className="sidebar__copy">단일 프로젝트 구조 / 로컬 우선 / 직접 입력 중심</p>
        <p className="sidebar__status">
          {projectLoaded ? (isSyncing ? "프로젝트명 저장 중" : `프로젝트 메타 ${projectSource ?? "로컬"}`) : "프로젝트 메타 불러오는 중"}
        </p>
      </div>

      <nav className="sidebar__nav">
        {items.map((item) => (
          <Link
            className={clsx("sidebar__link", pathname === item.href && "sidebar__link--active")}
            key={item.href}
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar__note">
        <p>로그인은 후순위입니다.</p>
        <p>프로젝트명과 todo 데이터는 직접 붙여넣거나 입력하면서 검증합니다.</p>
      </div>
    </aside>
  );
}