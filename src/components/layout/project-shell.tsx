import { Sidebar } from "@/components/layout/sidebar";

export function ProjectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Sidebar />
      <main className="shell__content">{children}</main>
    </div>
  );
}
