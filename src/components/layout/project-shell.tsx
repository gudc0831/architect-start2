import clsx from "clsx";
import { Sidebar } from "@/components/layout/sidebar";

type ProjectShellProps = {
  children: React.ReactNode;
  contentWidth?: "default" | "wide";
};

export function ProjectShell({ children, contentWidth = "default" }: ProjectShellProps) {
  return (
    <div className="shell">
      <div aria-hidden="true" className="shell__ambient" />
      <Sidebar />
      <main className="shell__content">
        <div className={clsx("shell__content-inner", contentWidth === "wide" && "shell__content-inner--wide")}>
          <div className="shell__content-frame">{children}</div>
        </div>
      </main>
    </div>
  );
}
