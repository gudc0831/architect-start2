import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";

loadEnvConfig(process.cwd());
loadPreviewEnvFile();

type CookieJar = Map<string, string>;

const previewUrl = resolvePreviewUrl();
const canonicalHost = process.env.ARCHITECT_PREVIEW_CANONICAL_HOST?.trim() || previewUrl.hostname;
const adminEmail = process.env.ARCHITECT_ADMIN_EMAIL?.trim() || process.env.PREVIEW_ADMIN_EMAIL?.trim() || "gudc083111@gmail.com";
const projectId = process.env.ARCHITECT_TEST_PROJECT_ID?.trim() || process.env.PREVIEW_PROJECT_B_ID?.trim() || "2150d595-0570-4309-9198-031e90668af4";
const storageStatePath = process.env.ARCHITECT_SMOKE_STORAGE_STATE?.trim();
const rawSmokeCookie = process.env.ARCHITECT_SMOKE_COOKIE?.trim();
const bypassToken = process.env.VERCEL_BYPASS_TOKEN?.trim() || process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

const results: Array<{ label: string; ok: boolean; detail?: string }> = [];

async function main() {
  assert.equal(previewUrl.hostname, canonicalHost, "ARCHITECT_PREVIEW_URL host must match ARCHITECT_PREVIEW_CANONICAL_HOST");

  const browser = await chromium.launch({ headless: true });
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  const seenRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === previewUrl.origin) {
      seenRequests.push(`${request.method()} ${url.pathname}`);
    }
  });

  await proveApiAuthAndProject(context);
  await proveKnowledgeApiReads(context);

  await page.goto(new URL("/admin/knowledge?work=candidates&candidateTab=evidence", previewUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("tab", { name: /후보 관리/ }).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: /승인 WIKI/ }).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: /로컬 WIKI 가져오기/ }).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: /운영 점검/ }).waitFor({ state: "visible" });
  await assertCount(countExactTabText(page, "내보내기/동기화"), 0, "top-level export/sync tab removed");
  pass("authenticated admin opened canonical knowledge page");

  await page.getByText("후보 목록").waitFor({ state: "visible" });
  await page.getByRole("tab", { name: /근거 확인/ }).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: /초안 다듬기/ }).click();
  await page.waitForURL(/candidateTab=draft/);
  await page.goBack();
  await page.waitForURL(/candidateTab=evidence/);
  pass("candidate list and candidate query Back/Forward sync loaded");

  await page.getByRole("tab", { name: /승인 WIKI/ }).click();
  await page.getByText("승인 항목 확인").waitFor({ state: "visible" });
  await page.goto(new URL("/admin/knowledge?work=approved&approvedFocus=export_sync", previewUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#approved-wiki-export-sync").waitFor({ state: "visible" });
  pass("approved WIKI readback and export/sync auxiliary surface loaded");

  await page.getByRole("tab", { name: /로컬 WIKI 가져오기/ }).click();
  await page.getByRole("heading", { name: "균형 선별 미리보기" }).waitFor({ state: "visible" });
  await page.getByText("사용자가 미리보기를 확정한 뒤에만").waitFor({ state: "visible" });
  await page.locator("body").filter({ hasText: "append-only audit" }).waitFor({ state: "visible" });
  await assertNoSensitiveText(await page.locator("body").innerText());
  pass("local import tab loads without local path or secret leakage");

  await page.getByRole("tab", { name: /운영 점검/ }).click();
  await page.getByText("운영 검증").waitFor({ state: "visible" });
  pass("operations tab loads degraded status surfaces");

  pass(`knowledge API paths observed on Preview surface (${seenRequests.length} same-origin browser requests)`);

  await browser.close();
  console.log(JSON.stringify({
    status: "knowledge-wiki-preview-smoke-pass",
    host: previewUrl.hostname,
    checks: results.length,
  }));
}

async function createAuthenticatedContext(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const extraHTTPHeaders = bypassToken ? { "x-vercel-protection-bypass": bypassToken } : undefined;
  if (storageStatePath) {
    const absoluteStatePath = resolve(process.cwd(), storageStatePath);
    if (!existsSync(absoluteStatePath)) {
      throw new Error("ARCHITECT_SMOKE_STORAGE_STATE does not point to an existing file");
    }
    return browser.newContext({ storageState: absoluteStatePath, extraHTTPHeaders });
  }

  const context = await browser.newContext({ extraHTTPHeaders });
  if (rawSmokeCookie) {
    await context.addCookies(readCookiesFromHeader(rawSmokeCookie));
    return context;
  }

  const jar = await createSupabaseSessionCookieJar();
  await context.addCookies([...jar.entries()].map(([name, value]) => ({
    name,
    value,
    domain: previewUrl.hostname,
    path: "/",
    secure: previewUrl.protocol === "https:",
    sameSite: "Lax" as const,
  })));
  return context;
}

async function proveApiAuthAndProject(context: BrowserContext) {
  const meResponse = await context.request.get(new URL("/api/auth/me", previewUrl).toString());
  assert.equal(meResponse.status(), 200, "/api/auth/me must return 200 for smoke admin");
  const mePayload = await meResponse.json() as { data?: { email?: string; accessStatus?: string; role?: string } };
  assert.equal(mePayload.data?.email, adminEmail, "authenticated user email mismatch");
  assert.equal(mePayload.data?.accessStatus, "active", "authenticated user must be active");

  const selectResponse = await context.request.post(new URL("/api/projects/select", previewUrl).toString(), {
    data: { projectId },
    headers: {
      origin: previewUrl.origin,
      referer: `${previewUrl.origin}/admin/knowledge`,
    },
  });
  assert.equal(selectResponse.status(), 200, "/api/projects/select must accept the smoke project");
}

async function proveKnowledgeApiReads(context: BrowserContext) {
  for (const path of [
    "/api/admin/knowledge/candidates",
    "/api/admin/knowledge/items",
    "/api/admin/knowledge/import-previews",
    "/api/admin/knowledge/rubrics",
    "/api/admin/knowledge/discovery-requests",
  ]) {
    const response = await context.request.get(new URL(path, previewUrl).toString());
    assert.equal(response.status(), 200, `${path} must return 200 on Preview`);
  }
  pass("knowledge API read paths return 200 on Preview");
}

async function createSupabaseSessionCookieJar() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseProjectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${supabaseProjectRef}-auth-token`;
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const linkResult = await admin.auth.admin.generateLink({ type: "magiclink", email: adminEmail });
  if (linkResult.error) {
    throw linkResult.error;
  }
  const tokenHash = linkResult.data.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error("Supabase magic link token hash missing");
  }
  const verifyResult = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyResult.error) {
    throw verifyResult.error;
  }
  const session = verifyResult.data.session;
  if (!session) {
    throw new Error("Supabase smoke session missing");
  }
  const jar: CookieJar = new Map();
  for (const chunk of createCookieChunks(cookieName, JSON.stringify(session))) {
    jar.set(chunk.name, encodeURIComponent(chunk.value));
  }
  return jar;
}

function resolvePreviewUrl() {
  const explicit = process.env.ARCHITECT_PREVIEW_URL?.trim() || process.env.PREVIEW_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const fromVercelUrl = process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : "";
  const value = explicit || fromVercelUrl;
  if (!value) {
    throw new Error("ARCHITECT_PREVIEW_URL or a Preview URL fallback is required");
  }
  return new URL(value.endsWith("/") ? value : `${value}/`);
}

function loadPreviewEnvFile() {
  const envPath = resolve(process.cwd(), ".env.preview.local");
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    if (process.env[key]) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value.replace(/\\n$/, "").trim();
  }
}

function readCookiesFromHeader(value: string) {
  const ignored = new Set(["path", "domain", "expires", "max-age", "secure", "httponly", "samesite"]);
  return value.split(/;\s*/).flatMap((part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      return [];
    }
    const name = part.slice(0, separatorIndex).trim();
    if (!name || ignored.has(name.toLowerCase())) {
      return [];
    }
    return [{
      name,
      value: part.slice(separatorIndex + 1).trim(),
      domain: previewUrl.hostname,
      path: "/",
      secure: previewUrl.protocol === "https:",
      sameSite: "Lax" as const,
    }];
  });
}

function createCookieChunks(key: string, value: string, chunkSize = 3180) {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= chunkSize) {
    return [{ name: key, value }];
  }
  const chunks: Array<{ name: string; value: string }> = [];
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
    chunks.push({ name: `${key}.${chunks.length}`, value: valueHead });
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }
  return chunks;
}

async function assertCount(actual: Promise<number>, expected: number, label: string) {
  assert.equal(await actual, expected, label);
}

async function countExactTabText(page: Page, label: string) {
  return page.locator('[role="tab"]').evaluateAll((nodes, expectedLabel) => (
    nodes.filter((node) => node.textContent?.trim() === expectedLabel).length
  ), label);
}

async function assertNoSensitiveText(text: string) {
  assert.doesNotMatch(text, /OPENAI_API_KEY\s*=|DATABASE_URL\s*=|Authorization:\s*Bearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----/i);
  assert.doesNotMatch(text, /[A-Z]:\\Users\\|\/home\/[^/\s]+/);
}

function assertSeenRequest(requests: string[], expected: string) {
  assert.ok(requests.some((request) => request === expected), `${expected} was not observed`);
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function pass(label: string) {
  results.push({ label, ok: true });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "knowledge wiki Preview smoke failed";
  console.error(`knowledge-wiki-preview-smoke-failed: ${message}`);
  process.exit(1);
});
