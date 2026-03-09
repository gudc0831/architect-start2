"use client";

import Link from "next/link";
import { useProjectMeta } from "@/providers/project-provider";

const items = [
  { href: "/board", label: "보드" },
  { href: "/daily", label: "작업목록(일별)" },
  { href: "/calendar", label: "작업목록(월별)" },
  { href: "/trash", label: "휴지통" },
] as const;

export function Sidebar() {
  const { projectName, setProjectName } = useProjectMeta();

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
        <p className="sidebar__copy">project 단일 구조 / local-first / 직접 입력형</p>
      </div>
      <nav className="sidebar__nav">
        {items.map((item) => (
          <Link className="sidebar__link" key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar__note">
        <p>로그인은 후순위입니다.</p>
        <p>프로젝트명과 todo 데이터는 직접 입력해서 시작합니다.</p>
      </div>
    </aside>
  );
}