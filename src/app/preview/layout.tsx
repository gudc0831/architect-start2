import { Suspense, type ReactNode } from "react";
import { t } from "@/lib/ui-copy";

type PreviewLayoutProps = {
  children: ReactNode;
};

export default function PreviewLayout({ children }: PreviewLayoutProps) {
  return <Suspense fallback={<div className="empty-state">{t("workspace.previewLoading")}</div>}>{children}</Suspense>;
}
