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
assert.match(adminPageSource, /requirePageUser\("\/admin"\)/);
assert.match(adminPageSource, /listProjectsForSession\(user\)/);
assert.match(adminPageSource, /redirect\("\/auth\/no-access" as Route\)/);
assert.match(adminPageSource, /<AdminFoundationShell \/>/);

const appShellSource = source("src/components/layout/app-shell.tsx");
assert.match(appShellSource, /function WorkspaceAccessGate/);
assert.match(appShellSource, /router\.replace\(buildLoginRedirect\(pathname\) as Route\)/);
assert.match(appShellSource, /router\.replace\("\/auth\/pending-access"(?: as Route)?\)/);
assert.match(appShellSource, /router\.replace\("\/auth\/no-access"(?: as Route)?\)/);
assert.match(appShellSource, /router\.replace\(\(user\.role === "admin" \? "\/admin" : "\/auth\/no-access"\) as Route\)/);

const projectShellSource = source("src/components/layout/project-shell.tsx");
assert.match(projectShellSource, /const \[isSidebarOpen, setIsSidebarOpen\] = useState\(false\)/);
assert.match(projectShellSource, /const \[isSidebarHoverOpen, setIsSidebarHoverOpen\] = useState\(false\)/);
assert.match(projectShellSource, /const \[isSidebarPinned, setIsSidebarPinned\] = useState\(false\)/);
assert.match(projectShellSource, /window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/);
assert.match(projectShellSource, /setIsSidebarHoverOpen\(true\)/);
assert.match(projectShellSource, /className="shell__sidebar-backdrop"/);
assert.match(projectShellSource, /onPointerDown=\{collapseSidebar\}/);
assert.match(projectShellSource, /"shell--sidebar-expanded"/);
assert.match(projectShellSource, /"shell--sidebar-pinned"/);

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
assert.match(sidebarSource, /const WORKSPACE_NAVIGATION_FALLBACK_DELAY_MS = 150/);
assert.match(sidebarSource, /function scheduleSidebarIdleWork\(callback: \(\) => void, timeout = 500\)/);
assert.match(sidebarSource, /const warmAdminNavigation = useCallback/);
assert.match(sidebarSource, /const prefetchWorkspaceRoute = useCallback/);
assert.match(sidebarSource, /const navigateWorkspaceRoute = useCallback/);
assert.match(sidebarSource, /router\.prefetch\(adminHref\)/);
assert.match(sidebarSource, /router\.push\(href\)/);
assert.match(sidebarSource, /window\.location\.assign\(targetUrl\.href\)/);
assert.match(sidebarSource, /WORKSPACE_NAVIGATION_FALLBACK_DELAY_MS/);
assert.match(sidebarSource, /data-workspace-navigation="true"/);
assert.match(sidebarSource, /className="sidebar__handle"/);
assert.match(sidebarSource, /!isExpanded \? \(/);
assert.match(sidebarSource, /className=\{clsx\("sidebar__pin-button"/);
assert.match(sidebarSource, /aria-pressed=\{isPinned\}/);
assert.match(sidebarSource, /onClickCapture=\{\(event\) => navigateWorkspaceRoute\(event, item\.mode, item\.href\)\}/);
assert.match(sidebarSource, /onPointerDownCapture=\{\(\) => prefetchWorkspaceRoute\(item\.href\)\}/);
assert.doesNotMatch(sidebarSource, /onPointerDownCapture=\{\(\) => warmWorkspaceNavigation\(item\.href, item\.mode\)\}/);
assert.match(sidebarSource, /onClickCapture=\{\(\) => markWorkspaceRouteTransition\("admin", adminHref\)\}/);

const globalCssSource = source("src/app/globals.css");
assert.match(globalCssSource, /--shell-sidebar-rail-width: 46px/);
assert.match(globalCssSource, /left: calc\(-1 \* \(var\(--shell-sidebar-width\) - var\(--shell-sidebar-rail-width\)\)\)/);
assert.match(globalCssSource, /\.shell--sidebar-pinned\s*\{\s*grid-template-columns: var\(--shell-sidebar-width\) minmax\(0, 1fr\);/);
assert.match(globalCssSource, /\.shell\.shell--sidebar-expanded > \.sidebar/);
assert.match(globalCssSource, /\.sidebar\.sidebar--expanded/);
assert.match(globalCssSource, /\.shell:not\(\.shell--sidebar-expanded\):not\(\.shell--sidebar-pinned\) \.sidebar__surface/);
assert.match(globalCssSource, /\.shell--sidebar-expanded \.sidebar__handle/);
assert.match(globalCssSource, /\.sidebar__handle/);
assert.match(globalCssSource, /\.shell__sidebar-backdrop/);
assert.match(globalCssSource, /\.sidebar__dock-actions\s*\{\s*position: absolute;[\s\S]*?right: 0\.45rem;/);

const routeTimingSource = source("src/lib/workspace/route-timing.ts");
assert.match(routeTimingSource, /export type WorkspaceRouteMode = DashboardMode \| "admin"/);

const taskWorkspaceSource = source("src/components/tasks/task-workspace.tsx");
assert.match(taskWorkspaceSource, /function isWorkspaceNavigationTarget\(target: HTMLElement\)/);
assert.match(taskWorkspaceSource, /target\.closest\('\[data-workspace-navigation="true"\], a\[href\], \.daily-sheet__view-mode-toggle'\)/);

const adminShellSource = source("src/components/admin/admin-foundation-shell.tsx");
assert.match(adminShellSource, /recordWorkspaceRouteReady\(\{/);
assert.match(adminShellSource, /mode: "admin"/);

console.log("workspace navigation harness: ok");
