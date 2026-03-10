import "./globals.css";
import { AuthProvider } from "@/providers/auth-provider";
import { ProjectProvider } from "@/providers/project-provider";
import { ProjectShell } from "@/components/layout/project-shell";

export const metadata = {
  title: "아키텍트 스타트",
  description: "로컬 우선 설계 협업 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <ProjectProvider>
            <ProjectShell>{children}</ProjectShell>
          </ProjectProvider>
        </AuthProvider>
      </body>
    </html>
  );
}