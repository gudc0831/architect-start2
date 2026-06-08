import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
import * as Y from "yjs";

loadEnvConfig(process.cwd());

type CookieJar = Map<string, string>;

type ProbeResponse = {
  status: number;
  body: unknown;
};

type Options = {
  url: string;
};

type Result = {
  label: string;
  ok: boolean;
  detail?: string;
};

type CellDocumentSnapshot = {
  plainText: string;
  yStateBase64: string | null;
};

type AuthMeData = {
  id?: unknown;
  profileId?: unknown;
  profile?: {
    id?: unknown;
  };
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

function parseOptions(argv: string[]): Options {
  return {
    url: readOptionValue(argv, "--url"),
  };
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

function record(label: string, ok: boolean, detail?: string) {
  results.push({ label, ok, detail });
}

function buildYTextReplaceUpdate(input: { yStateBase64: string | null; plainText: string; nextText: string; clientId: number }) {
  const doc = new Y.Doc();
  doc.clientID = input.clientId;
  if (input.yStateBase64) {
    Y.applyUpdate(doc, Buffer.from(input.yStateBase64, "base64"));
  } else {
    doc.getText("value").insert(0, input.plainText);
  }

  const text = doc.getText("value");
  const before = Y.encodeStateVector(doc);
  doc.transact(() => {
    text.delete(0, text.length);
    if (input.nextText) {
      text.insert(0, input.nextText);
    }
  });

  return Buffer.from(Y.encodeStateAsUpdate(doc, before)).toString("base64");
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

async function waitForTaskTitleParts(baseUrl: URL, jar: CookieJar, taskId: string, parts: readonly string[], timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastTitle = "";
  while (Date.now() < deadline) {
    const response = await request(baseUrl, jar, "GET", "/api/tasks");
    const tasks = dataOf<Array<{ id?: unknown; issueTitle?: unknown }>>(response.body) ?? [];
    const task = tasks.find((candidate) => candidate.id === taskId);
    lastTitle = typeof task?.issueTitle === "string" ? task.issueTitle : "";
    if (parts.every((part) => lastTitle.includes(part))) {
      return lastTitle;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Task projection did not include ${parts.join(", ")}. Last title: ${lastTitle}`);
}

async function getCellSnapshot(baseUrl: URL, jar: CookieJar, taskId: string) {
  const response = await request(baseUrl, jar, "GET", `/api/task-cell-documents/${encodeURIComponent(taskId)}/issueTitle`);
  if (response.status !== 200) {
    throw new Error(`Cell snapshot failed with ${response.status}`);
  }

  const snapshot = dataOf<CellDocumentSnapshot>(response.body);
  if (!snapshot) {
    throw new Error("Cell snapshot response did not include data.");
  }

  return snapshot;
}

function readProfileIdFromAuthMe(body: unknown) {
  const data = dataOf<AuthMeData>(body);
  const profileId = data?.profileId ?? data?.profile?.id ?? data?.id;
  if (typeof profileId !== "string" || !profileId.trim()) {
    throw new Error(`Unable to resolve profile id from /api/auth/me response: ${JSON.stringify(body).slice(0, 500)}`);
  }

  return profileId;
}

async function postCellUpdateFromPage(
  page: Page,
  taskId: string,
  projectId: string,
  profileId: string,
  clientUpdateId: string,
  updateBase64: string,
) {
  return page.evaluate(
    async (input) => {
      const response = await fetch(`/api/task-cell-documents/${encodeURIComponent(input.taskId)}/issueTitle/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUpdateId: input.clientUpdateId,
          updateBase64: input.updateBase64,
        }),
      });

      if (response.ok && typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("architect-start.daily-row-sync");
        channel.postMessage({
          name: "task-synced",
          scopeKey: `${input.projectId}:${input.profileId}`,
          projectId: input.projectId,
          profileId: input.profileId,
          operationType: "update",
          taskId: input.taskId,
          serverTaskId: input.taskId,
          occurredAt: new Date().toISOString(),
          sourceId: `daily-two-window-${input.clientUpdateId}`,
        });
        channel.close();
      }

      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      };
    },
    { taskId, projectId, profileId, clientUpdateId, updateBase64 },
  );
}

async function cleanupTask(baseUrl: URL, jar: CookieJar, taskId: string | null) {
  if (!taskId) {
    return;
  }

  await request(baseUrl, jar, "POST", `/api/tasks/${encodeURIComponent(taskId)}/trash`).catch(() => undefined);
  await request(baseUrl, jar, "DELETE", `/api/tasks/${encodeURIComponent(taskId)}`).catch(() => undefined);
}

async function rowFor(page: Page, taskId: string) {
  const row = page.locator(`[data-task-row-id="${taskId}"]`).first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  return row;
}

async function issueTitleCell(page: Page, taskId: string) {
  const row = await rowFor(page, taskId);
  return row.locator('[data-task-column="issueTitle"]').first();
}

async function openIssueTitleEditor(page: Page, taskId: string) {
  const cell = await issueTitleCell(page, taskId);
  await cell.scrollIntoViewIfNeeded();
  await cell.click({ force: true });
  await cell.evaluate((target) => {
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
  });
  const editor = page.locator('textarea[aria-label="issueTitle"][data-cell-document-status]').first();
  try {
    await editor.waitFor({ state: "visible", timeout: 5000 });
  } catch (error) {
    const textareaDiagnostics = await page
      .locator("textarea")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const textarea = node as HTMLTextAreaElement;
          return {
            ariaLabel: textarea.getAttribute("aria-label"),
            className: textarea.getAttribute("class"),
            cellDocumentStatus: textarea.getAttribute("data-cell-document-status"),
            value: textarea.value,
            visible: Boolean(textarea.offsetParent),
          };
        }),
      )
      .catch(() => []);
    throw new Error(`Cell document editor did not open. textareas=${JSON.stringify(textareaDiagnostics).slice(0, 1000)}`, {
      cause: error,
    });
  }
  return editor;
}

async function readCellText(page: Page, taskId: string) {
  const cell = await issueTitleCell(page, taskId);
  return (await cell.innerText()).trim();
}

async function waitForCellTextParts(page: Page, taskId: string, parts: readonly string[], timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await readCellText(page, taskId);
    if (parts.every((part) => lastText.includes(part))) {
      return lastText;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Cell text did not include ${parts.join(", ")}. Last text: ${lastText}`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  assert.ok(options.url, "--url is required");
  const url = new URL(options.url);
  assert.equal(url.pathname, "/daily", "two-window proof must target the DB-backed /daily route");

  const projectId = process.env.PREVIEW_PROJECT_B_ID?.trim() || "2150d595-0570-4309-9198-031e90668af4";
  const editorEmail = process.env.PREVIEW_EDITOR_EMAIL?.trim() || "preview-step11-editor@architect-start.test";
  const marker = `codex-ui-cell-${Date.now()}`;
  const editA = `${marker}-A`;
  const editB = `${marker}-B`;
  let taskId: string | null = null;

  const jar = await createAuthenticatedJar(url, editorEmail);
  const meResponse = await request(url, jar, "GET", "/api/auth/me");
  record("authenticated editor session", meResponse.status === 200, `status=${meResponse.status}`);
  const profileId = readProfileIdFromAuthMe(meResponse.body);
  const selectResponse = await request(url, jar, "POST", "/api/projects/select", { projectId });
  record("selected preview project", selectResponse.status === 200, `status=${selectResponse.status}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await addJarCookies(context, url, jar);
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const browserDiagnostics: string[] = [];
  for (const [label, page] of [["A", pageA], ["B", pageB]] as const) {
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        browserDiagnostics.push(`${label} console ${message.type()}: ${message.text().slice(0, 300)}`);
      }
    });
    page.on("pageerror", (error) => {
      browserDiagnostics.push(`${label} pageerror: ${error.message.slice(0, 300)}`);
    });
    page.on("response", (response) => {
      const responseUrl = response.url();
      if ((responseUrl.includes("/api/") || responseUrl.includes("/auth/")) && response.status() >= 400) {
        browserDiagnostics.push(`${label} response ${response.status()}: ${responseUrl}`);
      }
    });
  }

  try {
    await Promise.all([
      pageA.goto(url.toString(), { waitUntil: "domcontentloaded" }),
      pageB.goto(url.toString(), { waitUntil: "domcontentloaded" }),
    ]);
    try {
      await Promise.all([
        pageA.locator(".composer-card").first().waitFor({ state: "visible", timeout: 30000 }),
        pageB.locator(".workspace__body").first().waitFor({ state: "visible", timeout: 30000 }),
      ]);
    } catch (error) {
      const [titleA, bodyA] = await Promise.all([
        pageA.title().catch(() => ""),
        pageA.locator("body").innerText({ timeout: 1000 }).catch(() => ""),
      ]);
      throw new Error(
        `Daily UI did not expose the editable composer. url=${pageA.url()} title=${titleA} diagnostics=${browserDiagnostics
          .slice(-12)
          .join(" | ")} body=${bodyA.slice(0, 500)}`,
        { cause: error },
      );
    }
    record("opened two authenticated /daily windows", true, pageA.url());

    const titleInput = pageA.locator(".composer-card textarea.detail-text-field").first();
    await titleInput.fill(marker);
    const createStartedAt = Date.now();
    await pageA.locator(".composer-card button.primary-button").first().click();
    await pageA.locator(`[data-task-row-id] [data-task-column="issueTitle"]`).filter({ hasText: marker }).first().waitFor({
      state: "visible",
      timeout: 1000,
    });
    record("create local row visible within 1s", true, `${Date.now() - createStartedAt}ms`);

    const pageBSeenAt = Date.now();
    await pageB.locator(`[data-task-row-id] [data-task-column="issueTitle"]`).filter({ hasText: marker }).first().waitFor({
      state: "visible",
      timeout: 11000,
    });
    record("second window saw row before 12s poll", true, `${Date.now() - pageBSeenAt}ms`);

    const navSucceeded = await pageA
      .locator(".daily-sheet__view-mode-button")
      .nth(1)
      .click({ timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    record("daily view toggle usable immediately after create", navSucceeded);

    taskId = await waitForTaskByTitle(url, jar, marker);
    await Promise.all([rowFor(pageA, taskId), rowFor(pageB, taskId)]);
    record("server task id reconciled in both windows", true, taskId);

    await pageA.locator(".daily-sync-status").waitFor({ state: "detached", timeout: 15000 }).catch(() => undefined);
    const syncStatusCount = await pageA.locator(".daily-sync-status").count();
    const syncStatusDetail =
      syncStatusCount === 0
        ? "count=0"
        : await pageA
            .locator(".daily-sync-status")
            .first()
            .evaluate((node) => ({
              text: node.textContent,
              state: node.getAttribute("data-state"),
              operationType: node.getAttribute("data-operation-type"),
              errorCode: node.getAttribute("data-error-code"),
            }))
            .then((value) => JSON.stringify(value))
            .catch(() => `count=${syncStatusCount}`);
    record("sync status cleared after server ack without refresh", syncStatusCount === 0, syncStatusDetail);

    const initialSnapshot = await getCellSnapshot(url, jar, taskId);
    const updateA = buildYTextReplaceUpdate({
      yStateBase64: initialSnapshot.yStateBase64,
      plainText: initialSnapshot.plainText,
      nextText: editA,
      clientId: 1001,
    });
    const updateB = buildYTextReplaceUpdate({
      yStateBase64: initialSnapshot.yStateBase64,
      plainText: initialSnapshot.plainText,
      nextText: editB,
      clientId: 1002,
    });
    const [postA, postB] = await Promise.all([
      postCellUpdateFromPage(pageA, taskId, projectId, profileId, `${marker}-update-a`, updateA),
      postCellUpdateFromPage(pageB, taskId, projectId, profileId, `${marker}-update-b`, updateB),
    ]);
    record("both browser windows posted CRDT cell updates", postA.ok && postB.ok, `A=${postA.status}; B=${postB.status}`);

    const apiMergedTitle = await waitForTaskTitleParts(url, jar, taskId, [editA, editB], 20000);
    record("server projection contains merged CRDT text", true, apiMergedTitle);

    const [mergedA, mergedB] = await Promise.all([
      waitForCellTextParts(pageA, taskId, [editA, editB], 20000),
      waitForCellTextParts(pageB, taskId, [editA, editB], 20000),
    ]);
    record("both windows saw merged CRDT text without refresh", true, `A=${mergedA}; B=${mergedB}`);

    await Promise.all([pageA.reload({ waitUntil: "domcontentloaded" }), pageB.reload({ waitUntil: "domcontentloaded" })]);
    const [reloadA, reloadB] = await Promise.all([
      waitForCellTextParts(pageA, taskId, [editA, editB], 15000),
      waitForCellTextParts(pageB, taskId, [editA, editB], 15000),
    ]);
    record("reload preserved server projection and cell document text", true, `A=${reloadA}; B=${reloadB}`);
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
  process.exitCode = 1;
});
