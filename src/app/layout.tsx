import "./globals.css";
import { AuthProvider } from "@/providers/auth-provider";
import { ProjectProvider } from "@/providers/project-provider";
import { ProjectShell } from "@/components/layout/project-shell";

export const metadata = {
  title: "Architect Start",
  description: "Local-first rebuild scaffold",
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