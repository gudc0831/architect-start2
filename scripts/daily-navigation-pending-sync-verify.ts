import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext } from "playwright";

declare global {
  interface Window {
    __architectPendingSyncNavigationProbe?: boolean;
  }
}

type CookieJar = Map<string, string>;

type ProbeResponse = {
  status: number;
  body: unknown;
};

type Options = {
  url: string;
  delayMs: number;
  maxNavigationMs: number;
};

function parseOptions(argv: string[]): Options {
  const url = readOptionValue(argv, "--url") || process.env.PREVIEW_BASE_URL || "";
  const delayMs = Number(readOptionValue(argv, "--delay-ms") || "4000");
  const maxNavigationMs = Number(readOptionValue(argv, "--max-navigation-ms") || "1000");
  return {
    url,
    delayMs: Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 4000,
    maxNavigationMs: Number.isFinite(maxNavigationMs) && maxNavigationMs > 0 ? maxNavigationMs : 1000,
  };
}

function readOptionValue(argv: string[], key: string) {
  const index = argv.indexOf(key);
  if (index >= 0) {
    return argv[index + 1] ?? "";
  }

  const prefix = `${key}=`;
  const match = argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
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
  const shareUrl = process.env.VERCEL_SHARE_URL?.trim();
  if (!shareUrl) {
    return;
  }

  let currentUrl = new URL(shareUrl);
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

async function createAuthenticatedJar(baseUrl: URL, email: string) {
  const supabaseUrl = new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL"));
  const supabaseAuthCookieName = `sb-${supabaseUrl.hostname.split(".")[0]}-auth-token`;
  const jar = new Map<string, string>();
  await applyVercelPreviewBypass(jar, baseUrl);
  await addSupabaseSession(jar, email, supabaseAuthCookieName);
  return jar;
}

async function addJarCookies(context: BrowserContext, baseUrl: URL, jar: CookieJar) {
  await context.addCookies(
    [...jar.entries()].map(([name, value]) => ({
      name,
      value,
      domain: baseUrl.hostname,
      path: "/",
      httpOnly: name.startsWith("sb-"),
      secure: baseUrl.protocol === "https:",
      sameSite: "Lax" as const,
    })),
  );
}

async function request(baseUrl: URL, jar: CookieJar, method: string, path: string, body?: unknown): Promise<ProbeResponse> {
  const headers: Record<string, string> = {
    accept: "application/json",
    cookie: cookieHeader(jar),
  };

  if (method !== "GET" && method !== "HEAD") {
    headers["content-type"] = "application/json";
    headers.origin = baseUrl.origin;
    headers.referer = `${baseUrl.origin}/daily`;
  }

  const response = await fetch(`${baseUrl.origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  storeResponseCookies(jar, response);

  const text = await response.text();
  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 200);
    }
  }

  return { status: response.status, body: parsed };
}

function dataOf<T = unknown>(body: unknown): T | null {
  if (!body || typeof body !== "object" || !("data" in body)) {
    return null;
  }

  return (body as { data: T }).data;
}

async function waitForTaskByTitle(baseUrl: URL, jar: CookieJar, marker: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request(baseUrl, jar, "GET", "/api/tasks");
    const tasks = dataOf<Array<{ id?: unknown; issueTitle?: unknown }>>(response.body) ?? [];
    const task = tasks.find((candidate) => candidate.issueTitle === marker);
    if (task && typeof task.id === "string") {
      return task.id;
    }

    await delay(500);
  }

  return null;
}

async function delay(ms: number) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function main() {
  loadPreviewEnvFile();
  const options = parseOptions(process.argv.slice(2));
  assert.ok(options.url, "--url or PREVIEW_BASE_URL is required");

  const url = new URL(options.url);
  assert.equal(url.pathname, "/daily", "navigation pending-sync proof must target the DB-backed /daily route");

  const editorEmail = process.env.PREVIEW_EDITOR_EMAIL?.trim() || "preview-step11-editor@architect-start.test";
  const projectId = process.env.PREVIEW_PROJECT_B_ID?.trim() || "2150d595-0570-4309-9198-031e90668af4";
  const marker = `codex-nav-pending-${Date.now()}`;

  const jar = await createAuthenticatedJar(url, editorEmail);
  const selectResponse = await request(url, jar, "POST", "/api/projects/select", { projectId });
  assert.equal(selectResponse.status, 200, `project select failed: ${selectResponse.status}`);

  let taskId: string | null = null;
  let postStartedAt: number | null = null;
  let resolvePostStarted!: () => void;
  const postStarted = new Promise<void>((resolvePost) => {
    resolvePostStarted = resolvePost;
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await addJarCookies(context, url, jar);
  const page = await context.newPage();

  await page.route(`${url.origin}/api/tasks`, async (route, requestInfo) => {
    if (requestInfo.method() === "POST" && postStartedAt === null) {
      postStartedAt = Date.now();
      resolvePostStarted();
      await delay(options.delayMs);
    }

    await route.continue();
  });

  try {
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

    const composer = page.locator(".composer-card").first();
    await composer.waitFor({ state: "visible", timeout: 15_000 });
    await composer.getByRole("textbox", { name: /이슈 제목|Issue Title/i }).fill(marker);

    const createResponsePromise = page.waitForResponse(
      (response) => response.url() === `${url.origin}/api/tasks` && response.request().method() === "POST",
      { timeout: options.delayMs + 20_000 },
    );
    void createResponsePromise.catch(() => undefined);

    const createClickAt = Date.now();
    await composer.getByRole("button", { name: /작업 생성|Create task/i }).click();
    await page.getByText(marker, { exact: true }).first().waitFor({ state: "visible", timeout: 1_000 });
    const localRowVisibleMs = Date.now() - createClickAt;

    await postStarted;
    const navigationStartedAt = Date.now();
    await page.evaluate(() => {
      window.__architectPendingSyncNavigationProbe = true;
    });
    await page.locator(".sidebar").first().hover();
    await page.getByRole("link", { name: /보드|Board/i }).first().click();
    await page.waitForFunction(() => window.location.pathname === "/board", undefined, { timeout: options.maxNavigationMs });
    const navigationMs = Date.now() - navigationStartedAt;
    const sameDocumentNavigation = await page
      .evaluate(() => Boolean(window.__architectPendingSyncNavigationProbe))
      .catch(() => false);

    let createStatus: number | "timeout" = "timeout";
    try {
      const createResponse = await createResponsePromise;
      createStatus = createResponse.status();
      const createBody = (await createResponse.json().catch(() => null)) as unknown;
      taskId = dataOf<{ id?: unknown }>(createBody)?.id?.toString() ?? null;
    } catch {
      taskId = await waitForTaskByTitle(url, jar, marker);
    }

    const trashStatus = taskId ? (await request(url, jar, "POST", `/api/tasks/${encodeURIComponent(taskId)}/trash`)).status : null;
    const deleteStatus = taskId ? (await request(url, jar, "DELETE", `/api/tasks/${encodeURIComponent(taskId)}`)).status : null;
    if (deleteStatus === 200 || deleteStatus === 204) {
      taskId = null;
    }

    const ok =
      localRowVisibleMs <= 1_000 &&
      navigationMs <= options.maxNavigationMs &&
      sameDocumentNavigation &&
      createStatus === 201 &&
      (deleteStatus === 200 || deleteStatus === 204);

    console.log(
      JSON.stringify(
        {
          ok,
          url: url.toString(),
          delayedPostMs: options.delayMs,
          maxNavigationMs: options.maxNavigationMs,
          localRowVisibleMs,
          navigationMs,
          sameDocumentNavigation,
          postStartedAfterClickMs: postStartedAt === null ? null : postStartedAt - createClickAt,
          createStatus,
          cleanup: { trashStatus, deleteStatus },
        },
        null,
        2,
      ),
    );

    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    if (taskId) {
      await request(url, jar, "POST", `/api/tasks/${encodeURIComponent(taskId)}/trash`).catch(() => undefined);
      await request(url, jar, "DELETE", `/api/tasks/${encodeURIComponent(taskId)}`).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
