import clsx from "clsx";
import { Sidebar } from "@/components/layout/sidebar";

type ProjectShellProps = {
  children: React.ReactNode;
  contentWidth?: "default" | "wide";
};

export function ProjectShell({ children, contentWidth = "default" }: ProjectShellProps) {
  return (
    <div className="shell">
      <Sidebar />
      <main className="shell__content">
        <div className={clsx("shell__content-inner", contentWidth === "wide" && "shell__content-inner--wide")}>{children}</div>
      </main>
    </div>
  );
}
