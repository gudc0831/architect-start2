"use client";

import { usePathname } from "next/navigation";
import { ProjectProvider } from "@/providers/project-provider";
import { ProjectShell } from "@/components/layout/project-shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <ProjectProvider>
      <ProjectShell>{children}</ProjectShell>
    </ProjectProvider>
  );
}
