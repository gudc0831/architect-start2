import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext } from "playwright";

type CookieJar = Map<string, string>;

type ProbeResponse = {
  body: unknown;
  status: number;
};

type Result = {
  detail?: string;
  label: string;
  ok: boolean;
};

type FileRecord = {
  id: string;
  originalName: string;
};

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

async function createAuthenticatedJar(baseUrl: URL, email: string) {
  const supabaseUrl = new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL"));
  const supabaseAuthCookieName = `sb-${supabaseUrl.hostname.split(".")[0]}-auth-token`;
  const jar = new Map<string, string>();
  await applyVercelPreviewBypass(jar, baseUrl);

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
  for (const chunk of createCookieChunks(supabaseAuthCookieName, value)) {
    jar.set(chunk.name, encodeURIComponent(chunk.value));
  }

  return jar;
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

async function request(baseUrl: URL, jar: CookieJar, method: string, path: string, body?: unknown): Promise<ProbeResponse> {
  const headers: Record<string, string> = {
    accept: "application/json",
    cookie: cookieHeader(jar),
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
  storeResponseCookies(jar, response);

  const text = await response.text();
  let responseBody: unknown = text;
  try {
    responseBody = text ? JSON.parse(text) : null;
  } catch {
    responseBody = text;
  }

  return { body: responseBody, status: response.status };
}

function dataOf<T = unknown>(body: unknown): T | null {
  if (!body || typeof body !== "object" || !("data" in body)) {
    return null;
  }

  return (body as { data: T }).data;
}

function record(label: string, ok: boolean, detail?: string) {
  results.push({ label, ok, detail });
}

async function cleanupTask(baseUrl: URL, jar: CookieJar, taskId: string | null) {
  if (!taskId) {
    return;
  }

  await request(baseUrl, jar, "POST", `/api/tasks/${encodeURIComponent(taskId)}/trash`).catch(() => undefined);
  await request(baseUrl, jar, "DELETE", `/api/tasks/${encodeURIComponent(taskId)}`).catch(() => undefined);
}

async function waitForTaskByTitle(baseUrl: URL, jar: CookieJar, marker: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request(baseUrl, jar, "GET", "/api/tasks");
    const tasks = dataOf<Array<{ id?: unknown; issueTitle?: unknown }>>(response.body) ?? [];
    const task = tasks.find((candidate) => candidate.issueTitle === marker);
    if (task && typeof task.id === "string") {
      return task.id;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Task was not visible through /api/tasks: ${marker}`);
}

async function waitForUploadedFile(baseUrl: URL, jar: CookieJar, taskId: string, fileName: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastNames = "";
  while (Date.now() < deadline) {
    const response = await request(baseUrl, jar, "GET", `/api/files?taskId=${encodeURIComponent(taskId)}`);
    lastStatus = response.status;
    const files = dataOf<FileRecord[]>(response.body) ?? [];
    lastNames = files.map((file) => file.originalName).join(",");
    const file = files.find((candidate) => candidate.originalName === fileName);
    if (file) {
      return { file, status: response.status };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Uploaded file was not visible through /api/files. status=${lastStatus}; names=${lastNames}`);
}

async function main() {
  loadPreviewEnvFile();
  const urlValue = readOptionValue(process.argv.slice(2), "--url") || process.env.PREVIEW_BASE_URL || "";
  assert.ok(urlValue, "--url or PREVIEW_BASE_URL is required");
  const url = new URL(urlValue);
  assert.equal(url.pathname, "/daily", "file browser proof must target the DB-backed /daily route");

  const projectId = requireEnv("PREVIEW_PROJECT_B_ID");
  assertPreviewMutationTarget(url, projectId);
  const editorEmail = process.env.PREVIEW_EDITOR_EMAIL?.trim() || "preview-step11-editor@architect-start.test";
  const viewerEmail = process.env.PREVIEW_VIEWER_EMAIL?.trim() || "preview-step11-viewer@architect-start.test";
  const noAccessEmail = process.env.PREVIEW_NO_ACCESS_EMAIL?.trim() || "preview-step11-no-access@architect-start.test";
  const marker = `codex-file-flow-${Date.now()}`;
  const fileName = `${marker}.txt`;
  const fileContent = `Preview file browser verification ${marker}`;
  let taskId: string | null = null;
  let fileId: string | null = null;

  const jar = await createAuthenticatedJar(url, editorEmail);
  const viewerJar = await createAuthenticatedJar(url, viewerEmail);
  const noAccessJar = await createAuthenticatedJar(url, noAccessEmail);
  const selectResponse = await request(url, jar, "POST", "/api/projects/select", { projectId });
  record("editor can select preview project", selectResponse.status === 200, `status=${selectResponse.status}`);
  const viewerSelectResponse = await request(url, viewerJar, "POST", "/api/projects/select", { projectId });
  record("viewer can select preview project", viewerSelectResponse.status === 200, `status=${viewerSelectResponse.status}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addJarCookies(context, url, jar);
  const page = await context.newPage();
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      diagnostics.push(`${message.type()}: ${message.text().slice(0, 300)}`);
    }
  });
  page.on("response", (response) => {
    const responseUrl = response.url();
    if ((responseUrl.includes("/api/files") || responseUrl.includes("/api/upload")) && response.status() >= 400) {
      diagnostics.push(`response ${response.status()}: ${responseUrl}`);
    }
  });

  try {
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.locator(".composer-card").first().waitFor({ state: "visible", timeout: 30000 });

    const titleInput = page.locator(".composer-card textarea.detail-text-field").first();
    await titleInput.fill(marker);
    await page.locator(".composer-card button.primary-button").first().click();
    await page.locator(`[data-task-row-id] [data-task-column="issueTitle"]`).filter({ hasText: marker }).first().waitFor({
      state: "visible",
      timeout: 15000,
    });
    taskId = await waitForTaskByTitle(url, jar, marker);
    record("browser created file-flow task", Boolean(taskId), taskId);

    await page.locator(`[data-task-row-id="${taskId}"]`).first().click();
    const detailPanel = page.locator("#task-detail-panel").first();
    await detailPanel.waitFor({ state: "visible", timeout: 10000 });
    await detailPanel.waitFor({ state: "attached", timeout: 10000 });
    const uploadInputBeforeExpand = await detailPanel.locator('.upload-box input[type="file"]').count();
    if (uploadInputBeforeExpand === 0) {
      await detailPanel.locator(".detail-panel__summary-button").first().click();
    }

    const uploadBox = detailPanel.locator(".upload-box").first();
    await uploadBox.locator('input[type="file"]').waitFor({ state: "attached", timeout: 10000 });
    await uploadBox.locator('input[type="file"]').setInputFiles({
      buffer: Buffer.from(fileContent, "utf8"),
      mimeType: "text/plain",
      name: fileName,
    });
    await uploadBox.locator("button.primary-button").first().click();

    const filePill = page.locator(".file-pill").filter({ hasText: fileName }).first();
    await filePill.waitFor({ state: "visible", timeout: 30000 });
    record("browser uploaded file and rendered file pill", true, fileName);

    const openLink = filePill.locator("a.secondary-button").first();
    await openLink.waitFor({ state: "visible", timeout: 30000 });
    const { file, status: filesStatus } = await waitForUploadedFile(url, jar, taskId, fileName);
    fileId = file.id;
    record("files API lists uploaded file", Boolean(fileId), `status=${filesStatus}; fileId=${fileId}`);

    const viewerContent = await request(url, viewerJar, "GET", `/api/files/${encodeURIComponent(fileId)}/content`);
    record(
      "viewer can open authorized uploaded file",
      viewerContent.status === 200 && typeof viewerContent.body === "string" && viewerContent.body.includes(fileContent),
      `status=${viewerContent.status}`,
    );
    const noAccessContent = await request(url, noAccessJar, "GET", `/api/files/${encodeURIComponent(fileId)}/content`);
    record(
      "no-access user cannot open uploaded file",
      noAccessContent.status === 403,
      `status=${noAccessContent.status}`,
    );

    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 15000 }),
      openLink.click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    const popupText = (await popup.locator("body").innerText({ timeout: 15000 })).trim();
    record("browser open link returned uploaded file content", popupText.includes(fileContent), `popupUrl=${new URL(popup.url()).pathname}`);
    await popup.close().catch(() => undefined);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await cleanupTask(url, jar, taskId);
  }

  const ok = results.every((result) => result.ok);
  console.log(
    JSON.stringify(
      {
        ok,
        url: url.toString(),
        projectId,
        taskId,
        fileId,
        diagnostics: diagnostics.slice(-8),
        results,
      },
      null,
      2,
    ),
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  console.log(JSON.stringify({ ok: false, partialResults: results }, null, 2));
  process.exitCode = 1;
});
