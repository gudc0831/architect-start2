import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/providers/auth-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { t } from "@/lib/ui-copy";

export const metadata = {
  title: t("brand.appName"),
  description: t("brand.appDescription"),
};

const themeBootstrapScript = `
(() => {
  const fallbackTheme = "classic";
  const storageKey = "architect-start.theme-id";
  const validThemes = new Set(["classic", "swiss-modern", "productivity", "posthog", "apple-workbench"]);
  try {
    const isPreview = window.location.pathname.startsWith("/preview");
    const cookieTheme = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(storageKey + "="))
      ?.slice(storageKey.length + 1);
    const cachedTheme = isPreview ? fallbackTheme : window.localStorage.getItem(storageKey) || decodeURIComponent(cookieTheme || "");
    document.documentElement.dataset.theme = validThemes.has(cachedTheme) ? cachedTheme : fallbackTheme;
  } catch {
    document.documentElement.dataset.theme = fallbackTheme;
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
