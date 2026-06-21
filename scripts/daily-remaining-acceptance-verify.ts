import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";

type CookieJar = Map<string, string>;

type ProbeUser = {
  email: string;
  jar: CookieJar;
};

type ProbeResponse = {
  body: unknown;
  code: string | null;
  serverTiming: string | null;
  status: number;
};

type Result = {
  detail?: string;
  label: string;
  ok: boolean;
};

type Options = {
  realtimeTimeoutMs: number;
  reorderDelayMs: number;
  url: string;
  viewerReadyMs: number;
};

type AuthMeData = {
  accessStatus?: unknown;
  email?: unknown;
};

declare global {
  interface Window {
    __architectRealtimeFetchEvents?: Array<{
      at: number;
      method: string;
      status: number;
      url: string;
    }>;
  }
}

const results: Result[] = [];

function readOptionValue(argv: string[], key: string) {
  const index = argv.indexOf(key);
  if (index >= 0) {
    return argv[index + 1] ?? "";
  }

  const prefix = `${key}=`;
  const match = argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function parseOptions(argv: string[]): Options {
  const realtimeTimeoutMs = Number(readOptionValue(argv, "--realtime-timeout-ms") || "12000");
  const reorderDelayMs = Number(readOptionValue(argv, "--reorder-delay-ms") || "1500");
  const viewerReadyMs = Number(readOptionValue(argv, "--viewer-ready-ms") || "5000");
  return {
    realtimeTimeoutMs: Number.isFinite(realtimeTimeoutMs) && realtimeTimeoutMs > 0 ? realtimeTimeoutMs : 12000,
    reorderDelayMs: Number.isFinite(reorderDelayMs) && reorderDelayMs > 0 ? reorderDelayMs : 1500,
    url: readOptionValue(argv, "--url") || process.env.PREVIEW_BASE_URL || "",
    viewerReadyMs: Number.isFinite(viewerReadyMs) && viewerReadyMs >= 0 ? viewerReadyMs : 5000,
  };
}

function loadPreviewEnvFile() {
  const envPath = resolve(process.cwd(), ".env.preview.local");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value.replace(/\\n$/, "").trim();
    }
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function assertPreviewMutationTarget(url: URL, projectId: string) {
  if (process.env.ALLOW_PREVIEW_MUTATION_PROBE !== "1") {
    throw new Error("ALLOW_PREVIEW_MUTATION_PROBE=1 is required for this live Preview mutation probe.");
  }

  if (!url.hostname.endsWith(".vercel.app") || !url.hostname.includes("-git-")) {
    throw new Error(`Refusing live Preview mutation probe against non-branch-preview host: ${url.hostname}`);
  }

  if (!projectId.trim()) {
    throw new Error("PREVIEW_PROJECT_B_ID must be set explicitly for this live Preview mutation probe.");
  }
}

function setCookieFromHeader(jar: CookieJar, setCookieHeader: string) {
  const [pair] = setCookieHeader.split(";");
  const separatorIndex = pair.indexOf("=");
  if (separatorIndex <= 0) {
    return;
  }

  const name = pair.slice(0, separatorIndex).trim();
  const value = pair.slice(separatorIndex + 1).trim();
  if (name) {
    jar.set(name, value);
  }
}

function getSetCookieHeaders(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }

  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function storeResponseCookies(jar: CookieJar, response: Response) {
  for (const setCookie of getSetCookieHeaders(response.headers)) {
    setCookieFromHeader(jar, setCookie);
  }
}

function cookieHeader(jar: CookieJar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function createCookieChunks(key: string, value: string, chunkSize = 3180) {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= chunkSize) {
    return [{ name: key, value }];
  }

  const chunks: string[] = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, chunkSize);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");
    if (lastEscapePos > chunkSize - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }

    let valueHead = "";
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (error instanceof URIError && encodedChunkHead.at(-3) === "%" && encodedChunkHead.length > 3) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
          continue;
        }

        throw error;
      }
    }

    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }

  return chunks.map((chunk, index) => ({ name: `${key}.${index}`, value: chunk }));
}

async function applyVercelPreviewBypass(jar: CookieJar, previewUrl: URL) {
  const vercelShareUrl = process.env.VERCEL_SHARE_URL?.trim();
  if (!vercelShareUrl) {
    return;
  }

  let currentUrl = new URL(vercelShareUrl);
  for (let index = 0; index < 5; index += 1) {
    const response = await fetch(currentUrl, {
      headers: cookieHeader(jar) ? { cookie: cookieHeader(jar) } : undefined,
      redirect: "manual",
    });
    storeResponseCookies(jar, response);

    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) {
      return;
    }

    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.hostname !== previewUrl.hostname) {
      return;
    }

    currentUrl = nextUrl;
  }
}

async function addSupabaseSession(jar: CookieJar, email: string, supabaseAuthCookieName: string) {
  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const linkResult = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkResult.error) {
    throw linkResult.error;
  }

  const tokenHash = linkResult.data.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error(`Missing token hash for ${email}`);
  }

  const verifyResult = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyResult.error) {
    throw verifyResult.error;
  }

  const session = verifyResult.data.session;
  if (!session) {
    throw new Error(`Missing Supabase session for ${email}`);
  }

  const value = JSON.stringify(session);
  for (const key of [supabaseAuthCookieName, `${supabaseAuthCookieName}.0`, `${supabaseAuthCookieName}.1`, `${supabaseAuthCookieName}.2`]) {
    jar.delete(key);
  }

  for (const chunk of createCookieChunks(supabaseAuthCookieName, value)) {
    jar.set(chunk.name, encodeURIComponent(chunk.value));
  }
}

async function createProbeUser(baseUrl: URL, email: string): Promise<ProbeUser> {
  const supabaseUrl = new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL"));
  const supabaseAuthCookieName = `sb-${supabaseUrl.hostname.split(".")[0]}-auth-token`;
  const jar = new Map<string, string>();
  await applyVercelPreviewBypass(jar, baseUrl);
  await addSupabaseSession(jar, email, supabaseAuthCookieName);
  return { email, jar };
}

async function addJarCookies(context: BrowserContext, baseUrl: URL, jar: CookieJar) {
  await context.addCookies(
    [...jar.entries()].map(([name, value]) => ({
      domain: baseUrl.hostname,
      httpOnly: name.startsWith("sb-"),
      name,
      path: "/",
      sameSite: "Lax" as const,
      secure: baseUrl.protocol === "https:",
      value,
    })),
  );
}

async function request(baseUrl: URL, user: ProbeUser, method: string, path: string, body?: unknown): Promise<ProbeResponse> {
  const headers: Record<string, string> = {
    accept: "application/json",
    cookie: cookieHeader(user.jar),
  };

  if (method !== "GET" && method !== "HEAD") {
    headers["content-type"] = "application/json";
    headers.origin = baseUrl.origin;
    headers.referer = `${baseUrl.origin}/`;
  }

  const response = await fetch(`${baseUrl.origin}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
    redirect: "manual",
  });
  storeResponseCookies(user.jar, response);

  const text = await response.text();
  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 300);
    }
  }

  return {
    body: parsed,
    code: readResponseCode(parsed),
    serverTiming: response.headers.get("server-timing"),
    status: response.status,
  };
}

function dataOf<T = unknown>(body: unknown): T | null {
  if (!body || typeof body !== "object" || !("data" in body)) {
    return null;
  }

  return (body as { data: T }).data;
}

function readResponseCode(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const error = (body as { error?: { code?: unknown } }).error;
  const topLevelCode = (body as { code?: unknown }).code;
  const code = error?.code ?? topLevelCode;
  return typeof code === "string" ? code : null;
}

function readStageTimings(body: unknown) {
  if (!body || typeof body !== "object") {
    return [];
  }

  const meta = (body as { meta?: { timings?: unknown } }).meta;
  if (!Array.isArray(meta?.timings)) {
    return [];
  }

  return meta.timings
    .map((timing) => {
      if (!timing || typeof timing !== "object") {
        return null;
      }

      const name = (timing as { name?: unknown }).name;
      const durationMs = (timing as { durationMs?: unknown }).durationMs;
      return typeof name === "string" && typeof durationMs === "number" ? { durationMs, name } : null;
    })
    .filter((timing): timing is { durationMs: number; name: string } => Boolean(timing));
}

function readAuthEmailAndStatus(body: unknown) {
  const data = dataOf<AuthMeData>(body);
  return {
    accessStatus: typeof data?.accessStatus === "string" ? data.accessStatus : "",
    email: typeof data?.email === "string" ? data.email : "",
  };
}

function record(label: string, ok: boolean, detail?: string) {
  results.push({ detail, label, ok });
}

async function selectProject(baseUrl: URL, user: ProbeUser, projectId: string) {
  return request(baseUrl, user, "POST", "/api/projects/select", { projectId });
}

async function cleanupTask(baseUrl: URL, editor: ProbeUser, taskId: string | null) {
  if (!taskId) {
    return { deleteStatus: null, trashStatus: null };
  }

  const trash = await request(baseUrl, editor, "POST", `/api/tasks/${encodeURIComponent(taskId)}/trash`).catch(() => null);
  const deleted = await request(baseUrl, editor, "DELETE", `/api/tasks/${encodeURIComponent(taskId)}`).catch(() => null);
  return { deleteStatus: deleted?.status ?? null, trashStatus: trash?.status ?? null };
}

async function disableBroadcastChannelAndCaptureTaskFetches(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    window.__architectRealtimeFetchEvents = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : input.toString();
      const method = request?.method ?? init?.method ?? "GET";
      if (url.includes("/api/tasks")) {
        window.__architectRealtimeFetchEvents?.push({
          at: Date.now(),
          method,
          status: response.status,
          url,
        });
      }
      return response;
    };
  });
}

async function readTaskFetchEvents(page: Page) {
  return page.evaluate(() => window.__architectRealtimeFetchEvents ?? []);
}

async function verifyRealtimeAndPermissions(input: {
  baseUrl: URL;
  editor: ProbeUser;
  noAccess: ProbeUser;
  projectId: string;
  realtimeTimeoutMs: number;
  viewerReadyMs: number;
  viewer: ProbeUser;
}) {
  const { baseUrl, editor, noAccess, projectId, realtimeTimeoutMs, viewer, viewerReadyMs } = input;
  const marker = `codex-realtime-${Date.now()}`;
  let taskId: string | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    const viewerMe = await request(baseUrl, viewer, "GET", "/api/auth/me");
    const viewerIdentity = readAuthEmailAndStatus(viewerMe.body);
    record(
      "viewer authenticated active session",
      viewerMe.status === 200 && viewerIdentity.email === viewer.email && viewerIdentity.accessStatus === "active",
      `status=${viewerMe.status}; accessStatus=${viewerIdentity.accessStatus}`,
    );

    const viewerSelect = await selectProject(baseUrl, viewer, projectId);
    record("viewer can select Project B", viewerSelect.status === 200, `status=${viewerSelect.status}`);

    browser = await chromium.launch({ headless: true });
    const viewerContext = await browser.newContext();
    await disableBroadcastChannelAndCaptureTaskFetches(viewerContext);
    await addJarCookies(viewerContext, baseUrl, viewer.jar);
    const viewerPage = await viewerContext.newPage();

    await viewerPage.goto(baseUrl.toString(), { waitUntil: "domcontentloaded" });
    await viewerPage.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await viewerPage.locator("body").waitFor({ state: "visible", timeout: 10_000 });
    await new Promise((resolve) => setTimeout(resolve, viewerReadyMs));

    const beforeCreateFetchCount = (await readTaskFetchEvents(viewerPage)).length;
    const createStartedAt = Date.now();
    const created = await request(baseUrl, editor, "POST", "/api/tasks", {
      issueTitle: marker,
      isDaily: true,
      status: "todo",
    });
    taskId = dataOf<{ id?: unknown }>(created.body)?.id?.toString() ?? null;
    record("editor created realtime probe task", created.status === 201 && Boolean(taskId), `status=${created.status}`);
    const createTimings = readStageTimings(created.body);
    const createTimingNames = createTimings.map((timing) => timing.name);
    const createTimingTotalMs = Math.round(createTimings.reduce((total, timing) => total + timing.durationMs, 0));
    record(
      "create response includes stage timing bottleneck evidence",
      createTimingNames.includes("route.createTask") &&
        createTimingNames.includes("repository.insert") &&
        createTimingNames.includes("repository.lockAndTaskNumberLookup"),
      `timings=${createTimingNames.join(",")}; totalMs=${createTimingTotalMs}; serverTiming=${created.serverTiming ? "present" : "missing"}`,
    );

    await viewerPage
      .locator('[data-task-row-id] [data-task-column="issueTitle"]')
      .filter({ hasText: marker })
      .first()
      .waitFor({ state: "visible", timeout: realtimeTimeoutMs });
    const rowVisibleMs = Date.now() - createStartedAt;
    const afterCreateFetches = (await readTaskFetchEvents(viewerPage)).filter((event) => event.at >= createStartedAt);
    record(
      "viewer received task via Supabase realtime without BroadcastChannel",
      rowVisibleMs < realtimeTimeoutMs && afterCreateFetches.length > 0,
      `rowVisibleMs=${rowVisibleMs}; taskFetchesAfterCreate=${afterCreateFetches.length}; fetchesBefore=${beforeCreateFetchCount}; viewerReadyMs=${viewerReadyMs}`,
    );

    assert.ok(taskId, "taskId should exist after realtime probe create");
    const viewerSnapshot = await request(baseUrl, viewer, "GET", `/api/task-cell-documents/${encodeURIComponent(taskId)}/issueTitle`);
    const snapshotText = dataOf<{ plainText?: unknown }>(viewerSnapshot.body)?.plainText;
    record(
      "viewer can read cell document snapshot",
      viewerSnapshot.status === 200 && snapshotText === marker,
      `status=${viewerSnapshot.status}; code=${viewerSnapshot.code ?? ""}`,
    );

    const viewerUpdate = await request(baseUrl, viewer, "POST", `/api/task-cell-documents/${encodeURIComponent(taskId)}/issueTitle/updates`, {
      clientUpdateId: `${marker}-viewer`,
      updateBase64: "AAAA",
    });
    record(
      "viewer cannot post cell document update",
      viewerUpdate.status === 403 && viewerUpdate.code === "PROJECT_EDITOR_REQUIRED",
      `status=${viewerUpdate.status}; code=${viewerUpdate.code ?? ""}`,
    );

    const noAccessProject = await request(baseUrl, noAccess, "GET", "/api/project");
    record(
      "no-access current project denied",
      noAccessProject.status === 403 && noAccessProject.code === "PROJECT_ACCESS_DENIED",
      `status=${noAccessProject.status}; code=${noAccessProject.code ?? ""}`,
    );

    const noAccessSnapshot = await request(baseUrl, noAccess, "GET", `/api/task-cell-documents/${encodeURIComponent(taskId)}/issueTitle`);
    record(
      "no-access cannot read cell document snapshot",
      noAccessSnapshot.status === 403 && noAccessSnapshot.code === "PROJECT_ACCESS_DENIED",
      `status=${noAccessSnapshot.status}; code=${noAccessSnapshot.code ?? ""}`,
    );
  } finally {
    await browser?.close();
    const cleanup = await cleanupTask(baseUrl, editor, taskId);
    record(
      "realtime permission probe cleanup",
      cleanup.deleteStatus === 200 || cleanup.deleteStatus === 204,
      `trash=${cleanup.trashStatus}; delete=${cleanup.deleteStatus}`,
    );
  }
}

async function verifyReorderSyncStatus(input: {
  baseUrl: URL;
  editor: ProbeUser;
  reorderDelayMs: number;
}) {
  const { baseUrl, editor, reorderDelayMs } = input;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await addJarCookies(context, baseUrl, editor.jar);
  const page = await context.newPage();
  let delayedReorder = false;

  await page.route(`${baseUrl.origin}/api/tasks/reorder`, async (route, requestInfo) => {
    if (requestInfo.method() === "POST") {
      delayedReorder = true;
      await new Promise((resolve) => setTimeout(resolve, reorderDelayMs));
    }

    await route.continue();
  });

  try {
    await page.goto(baseUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    const orderButton = page.getByRole("button", { name: "작업 정렬 메뉴" }).first();
    await orderButton.waitFor({ state: "visible", timeout: 20_000 });
    await orderButton.click();

    const reorderResponsePromise = page.waitForResponse(
      (response) => response.url() === `${baseUrl.origin}/api/tasks/reorder` && response.request().method() === "POST",
      { timeout: reorderDelayMs + 20_000 },
    );
    await page.getByRole("button", { name: /Task 번호 순서로 복원/ }).click();

    const syncStatus = page.locator(".daily-sync-status").first();
    const syncStatusSeen = await syncStatus.waitFor({ state: "visible", timeout: Math.max(800, reorderDelayMs) }).then(
      () => true,
      () => false,
    );
    const response = await reorderResponsePromise;
    await syncStatus.waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
    const remainingSyncStatusCount = await page.locator(".daily-sync-status").count();

    record(
      "reorder request was artificially delayed",
      delayedReorder,
      `delayMs=${reorderDelayMs}`,
    );
    record("reorder API returned success", response.status() === 200, `status=${response.status()}`);
    record(
      "reorder sync status cleared without refresh",
      syncStatusSeen && remainingSyncStatusCount === 0,
      `statusSeen=${syncStatusSeen}; remaining=${remainingSyncStatusCount}`,
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  loadPreviewEnvFile();
  const options = parseOptions(process.argv.slice(2));
  assert.ok(options.url, "--url or PREVIEW_BASE_URL is required");
  const baseUrl = new URL(options.url);
  assert.equal(baseUrl.pathname, "/daily", "remaining acceptance proof must target the DB-backed /daily route");

  const projectId = requireEnv("PREVIEW_PROJECT_B_ID");
  assertPreviewMutationTarget(baseUrl, projectId);
  const editorEmail = process.env.PREVIEW_EDITOR_EMAIL?.trim() || "preview-step11-editor@architect-start.test";
  const viewerEmail = process.env.PREVIEW_VIEWER_EMAIL?.trim() || "preview-step11-viewer@architect-start.test";
  const noAccessEmail = process.env.PREVIEW_NO_ACCESS_EMAIL?.trim() || "gudc0831111@gmail.com";

  const [editor, viewer, noAccess] = await Promise.all([
    createProbeUser(baseUrl, editorEmail),
    createProbeUser(baseUrl, viewerEmail),
    createProbeUser(baseUrl, noAccessEmail),
  ]);

  const editorMe = await request(baseUrl, editor, "GET", "/api/auth/me");
  const editorIdentity = readAuthEmailAndStatus(editorMe.body);
  record(
    "editor authenticated active session",
    editorMe.status === 200 && editorIdentity.email === editor.email && editorIdentity.accessStatus === "active",
    `status=${editorMe.status}; accessStatus=${editorIdentity.accessStatus}`,
  );
  const editorSelect = await selectProject(baseUrl, editor, projectId);
  record("editor can select Project B", editorSelect.status === 200, `status=${editorSelect.status}`);

  await verifyRealtimeAndPermissions({
    baseUrl,
    editor,
    noAccess,
    projectId,
    realtimeTimeoutMs: options.realtimeTimeoutMs,
    viewerReadyMs: options.viewerReadyMs,
    viewer,
  });
  await verifyReorderSyncStatus({ baseUrl, editor, reorderDelayMs: options.reorderDelayMs });

  const failed = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        projectId,
        results,
        url: baseUrl.toString(),
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
