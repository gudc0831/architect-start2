import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/providers/auth-provider";
import { t } from "@/lib/ui-copy";

export const metadata = {
  title: t("brand.appName"),
  description: t("brand.appDescription"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
