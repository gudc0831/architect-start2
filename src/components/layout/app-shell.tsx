"use client";

import { usePathname } from "next/navigation";
import { ProjectProvider } from "@/providers/project-provider";
import { ProjectShell } from "@/components/layout/project-shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const contentWidth = pathname === "/daily" || pathname === "/preview/daily" ? "wide" : "default";

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <ProjectProvider>
      <ProjectShell contentWidth={contentWidth}>{children}</ProjectShell>
    </ProjectProvider>
  );
}
