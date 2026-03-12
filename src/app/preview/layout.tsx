import { Suspense, type ReactNode } from "react";

type PreviewLayoutProps = {
  children: ReactNode;
};

export default function PreviewLayout({ children }: PreviewLayoutProps) {
  return <Suspense fallback={<div className="empty-state">Loading preview...</div>}>{children}</Suspense>;
}