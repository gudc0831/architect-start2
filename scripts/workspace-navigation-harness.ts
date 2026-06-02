import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

const workspacePages = ["board", "daily", "calendar", "trash"] as const;
for (const page of workspacePages) {
  const pageSource = source(`src/app/${page}/page.tsx`);
  assert.doesNotMatch(pageSource, /requireWorkspacePageUser/);
  assert.doesNotMatch(pageSource, /async function/);
  assert.match(pageSource, new RegExp(`TaskWorkspace mode="${page}"`));
}

const materialsPageSource = source("src/app/materials/page.tsx");
assert.doesNotMatch(materialsPageSource, /TaskWorkspace mode="materials"/);
assert.match(materialsPageSource, /ProjectMaterialsPage/);

const previewMaterialsPageSource = source("src/app/preview/materials/page.tsx");
assert.match(previewMaterialsPageSource, /ProjectMaterialsPage/);

const adminPageSource = source("src/app/admin/page.tsx");
assert.doesNotMatch(adminPageSource, /requirePageUser|listProjectsForSession|redirect/);
assert.match(adminPageSource, /<AdminFoundationShell \/>/);

const appShellSource = source("src/components/layout/app-shell.tsx");
assert.match(appShellSource, /function WorkspaceAccessGate/);
assert.match(appShellSource, /router\.replace\(buildLoginRedirect\(pathname\) as Route\)/);
assert.match(appShellSource, /router\.replace\("\/auth\/pending-access"(?: as Route)?\)/);
assert.match(appShellSource, /router\.replace\("\/auth\/no-access"(?: as Route)?\)/);
assert.match(appShellSource, /router\.replace\(\(user\.role === "admin" \? "\/admin" : "\/auth\/no-access"\) as Route\)/);

const rootLayoutSource = source("src/app/layout.tsx");
assert.match(rootLayoutSource, /const themeBootstrapScript =/);
assert.match(rootLayoutSource, /architect-start\.theme-id/);
assert.match(rootLayoutSource, /document\.cookie/);
assert.match(rootLayoutSource, /suppressHydrationWarning/);
assert.match(rootLayoutSource, /dangerouslySetInnerHTML/);

const themeProviderSource = source("src/providers/theme-provider.tsx");
assert.match(themeProviderSource, /const themePreferenceStorageKey = "architect-start\.theme-id"/);
assert.match(themeProviderSource, /function readThemeCookie/);
assert.match(themeProviderSource, /useState<ThemeId>\(\(\) => readCachedThemeId\(pathname\)\)/);
assert.match(themeProviderSource, /writeCachedThemeId\(preference\.themeId\)/);
assert.match(themeProviderSource, /writeCachedThemeId\(nextThemeId\)/);
assert.doesNotMatch(themeProviderSource, /\.catch\(\(\) => \{[\s\S]*setThemeIdState\(DEFAULT_THEME_ID\);[\s\S]*setIsLoaded\(true\);/);

const themeRouteSource = source("src/app/api/preferences/theme/route.ts");
assert.match(themeRouteSource, /themePreferenceResponse/);
assert.match(themeRouteSource, /response\.cookies\.set\(themePreferenceCookieName, preference\.themeId/);

const sidebarSource = source("src/components/layout/sidebar.tsx");
assert.match(sidebarSource, /href: "\/materials", mode: "materials"/);
assert.match(sidebarSource, /function scheduleSidebarIdleWork\(callback: \(\) => void, timeout = 500\)/);
assert.match(sidebarSource, /const warmAdminNavigation = useCallback/);
assert.match(sidebarSource, /router\.prefetch\(adminHref\)/);
assert.match(sidebarSource, /data-workspace-navigation="true"/);
assert.match(sidebarSource, /onPointerDownCapture=\{\(\) => warmWorkspaceNavigation\(item\.href, item\.mode\)\}/);
assert.match(sidebarSource, /onClickCapture=\{\(\) => markWorkspaceRouteTransition\("admin", adminHref\)\}/);

const routeTimingSource = source("src/lib/workspace/route-timing.ts");
assert.match(routeTimingSource, /export type WorkspaceRouteMode = DashboardMode \| "admin"/);

const taskWorkspaceSource = source("src/components/tasks/task-workspace.tsx");
assert.match(taskWorkspaceSource, /function isWorkspaceNavigationTarget\(target: HTMLElement\)/);
assert.match(taskWorkspaceSource, /target\.closest\('\[data-workspace-navigation="true"\]'\)/);

const adminShellSource = source("src/components/admin/admin-foundation-shell.tsx");
assert.match(adminShellSource, /recordWorkspaceRouteReady\(\{/);
assert.match(adminShellSource, /mode: "admin"/);

console.log("workspace navigation harness: ok");
