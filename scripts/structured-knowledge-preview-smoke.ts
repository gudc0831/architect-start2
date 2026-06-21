import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, type APIResponse, type BrowserContext, type Page } from "playwright";

loadEnvConfig(process.cwd());
loadPreviewEnvFile();

type CookieJar = Map<string, string>;

type KnowledgeCandidate = {
  id: string;
  projectId: string;
  title: string;
};

const smokeUrl = resolveSmokeUrl();
const noSkip = process.argv.includes("--no-skip") || process.env.STRUCTURED_KNOWLEDGE_SMOKE_NO_SKIP === "1";
const expectedAdminEmail = process.env.ARCHITECT_ADMIN_EMAIL?.trim() || process.env.PREVIEW_ADMIN_EMAIL?.trim();
const magicLinkAdminEmail = expectedAdminEmail || "gudc083111@gmail.com";
const fallbackProjectId = process.env.ARCHITECT_TEST_PROJECT_ID?.trim() || process.env.PREVIEW_PROJECT_B_ID?.trim();
const storageStatePath = process.env.ARCHITECT_SMOKE_STORAGE_STATE?.trim();
const rawSmokeCookie = process.env.ARCHITECT_SMOKE_COOKIE?.trim();
const bypassToken = process.env.VERCEL_BYPASS_TOKEN?.trim() || process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

const routes = [
  "/admin/knowledge?work=candidates&candidateTab=evidence",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=sources",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=reasoning",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=ontology",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=toc",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=sections",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=preview",
  "/admin/knowledge?work=candidates&candidateTab=draft&draftSubview=metadata",
  "/admin/knowledge?work=candidates&candidateTab=decision",
  "/admin/knowledge?work=approved",
  "/admin/knowledge?work=local_import",
  "/admin/knowledge?work=operations",
] as const;

const draftSubviewLabels = {
  sources: "Source buckets",
  reasoning: "Integrated reasoning summary",
  ontology: "Ontology",
  toc: "TOC",
  sections: "Section editor",
  preview: "Markdown preview",
  metadata: "Generation metadata",
} as const;

const results: Array<{ label: string; ok: boolean; detail?: string }> = [];
const skipped: string[] = [];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const failedKnowledgeResponses: string[] = [];

async function main() {
  assertReleaseTargetReady();
  const browser = await chromium.launch({ headless: true });
  const context = await createAuthenticatedContext(browser);
  const page = await context.newPage();
  attachPageCollectors(page);

  await proveApiAuth(context);
  const candidate = await readFirstCandidate(context);
  if (!candidate) {
    skipOrThrow("No knowledge candidate was available for structured draft generation.");
  }
  await selectSmokeProject(context, candidate?.projectId ?? fallbackProjectId ?? "");

  await openRoute(page, withCandidate(routes[0], candidate));
  await expectText(page, "후보 목록", "candidate queue visible");
  await expectText(page, "근거 확인", "evidence tab visible");

  await openRoute(page, withCandidate(routes[1], candidate));
  await assertSourceBucketLabels(page);

  if (candidate) {
    await generateStructuredDraftThroughUi(page);
    await assertGeneratedDraftSubviews(page);
  } else {
    for (const route of routes.slice(2, 8)) {
      await openRoute(page, route);
      await expectText(page, "구조화 초안 대기", `empty structured draft route visible: ${route}`);
    }
    skipOrThrow("No knowledge candidate was available, so generated draft-only labels were not asserted.");
  }

  await openRoute(page, withCandidate(routes[8], candidate));
  await expectText(page, "승인 결정", "decision route visible");

  await openRoute(page, routes[9]);
  await expectText(page, "승인 항목 확인", "approved WIKI route visible");

  await openRoute(page, routes[10]);
  await expectText(page, "균형 선별 미리보기", "local WIKI import route visible");

  await openRoute(page, withCandidate(routes[11], candidate));
  await assertGenerationProfilePanel(page);

  assertNoCollectedErrors();
  assertNoReleaseSkips();
  await browser.close();
  console.log(JSON.stringify({
    status: "structured-knowledge-preview-smoke-pass",
    origin: smokeUrl.origin,
    noSkip,
    checks: results.length,
    skipped,
  }, null, 2));
}

function assertReleaseTargetReady() {
  if (!noSkip) {
    return;
  }
  if (smokeUrl.hostname === "localhost" || smokeUrl.hostname === "127.0.0.1" || smokeUrl.hostname === "::1") {
    throw new Error("--no-skip release smoke requires an explicit Preview/deployment URL, not localhost.");
  }
  if (!expectedAdminEmail) {
    throw new Error("--no-skip release smoke requires ARCHITECT_ADMIN_EMAIL or PREVIEW_ADMIN_EMAIL.");
  }
}

function attachPageCollectors(page: Page) {
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === smokeUrl.origin && url.pathname.startsWith("/api/admin/knowledge/") && response.status() >= 400) {
      failedKnowledgeResponses.push(`${response.status()} ${url.pathname}${url.search}`);
    }
  });
}

async function openRoute(page: Page, route: string) {
  await page.goto(new URL(route, smokeUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /후보 관리/ }).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: /승인 WIKI/ }).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: /로컬 WIKI 가져오기/ }).waitFor({ state: "visible" });
  await page.getByRole("tab", { name: /운영 점검/ }).waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  pass(`opened ${route}`);
}

async function assertSourceBucketLabels(page: Page) {
  for (const label of ["법규 근거", "Task 맥락", "프로젝트 자료", "기존 승인 WIKI", "로컬 WIKI", "외부 근거"]) {
    await expectText(page, label, `source bucket label: ${label}`);
  }
  for (const label of ["blocking / 차단", "warning / 주의", "ready / 준비됨"]) {
    await expectText(page, label, `source bucket status label: ${label}`);
  }
}

async function generateStructuredDraftThroughUi(page: Page) {
  const generateButton = page.getByRole("button", { name: /구조화 초안 생성/ });
  await generateButton.waitFor({ state: "visible" });
  await assertButtonEnabled(generateButton, "structured draft generate button");
  const draftResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/structured-draft") && response.request().method() === "POST";
  }, { timeout: 30000 });
  await generateButton.click();
  const response = await draftResponse;
  assert.equal(response.status(), 200, "structured draft generation route must return 200");
  await expectText(page, "Markdown 본문에 반영", "structured draft generated and apply control visible");
}

async function assertGeneratedDraftSubviews(page: Page) {
  await clickDraftSubview(page, "sources");
  await assertSourceBucketLabels(page);

  await clickDraftSubview(page, "reasoning");
  await expectText(page, "Integrated reasoning summary", "reasoning label visible");
  await expectText(page, "Claim-evidence matrix", "claim-evidence matrix label visible");

  await clickDraftSubview(page, "ontology");
  await expectText(page, "concept label", "ontology concept label visible");
  await expectText(page, "relation reason", "ontology relation reason visible");

  await clickDraftSubview(page, "toc");
  for (const label of ["요약", "적용 기준", "확인 절차", "근거", "예외 / 주의"]) {
    await expectText(page, label, `required TOC label: ${label}`);
  }

  await clickDraftSubview(page, "sections");
  await expectText(page, "Section editor", "section editor label visible");

  await clickDraftSubview(page, "preview");
  await expectText(page, "Markdown preview", "markdown preview label visible");

  await clickDraftSubview(page, "metadata");
  await expectText(page, "생성 메타데이터", "generation metadata label visible");
}

async function clickDraftSubview(page: Page, subview: keyof typeof draftSubviewLabels) {
  await page.getByRole("button", { name: draftSubviewLabels[subview] }).click();
  if (subview === "sources") {
    await page.waitForURL(/candidateTab=draft/, { timeout: 10000 });
    return;
  }
  await page.waitForURL((url) => url.searchParams.get("draftSubview") === subview, { timeout: 10000 });
}

async function assertGenerationProfilePanel(page: Page) {
  await expectText(page, "Generation profile", "generation profile panel visible");
  await expectText(page, "active profile name", "active profile summary visible");
  await expectText(page, "sourceBucketRules JSON editor", "profile source bucket editor visible");
  await expectText(page, "before/after diff preview", "profile diff preview visible");
  await expectText(page, "activation impact summary", "profile impact summary visible");
  await expectText(page, "activation confirmation", "profile activation control visible");
  await expectText(page, "rollback reason", "profile rollback reason visible");
}

async function readFirstCandidate(context: BrowserContext): Promise<KnowledgeCandidate | null> {
  const response = await checkedGet(context, "/api/admin/knowledge/candidates");
  const payload = await response.json() as { data?: KnowledgeCandidate[] };
  const candidates = Array.isArray(payload.data) ? payload.data : [];
  return candidates.find((candidate) => Boolean(candidate.id && candidate.projectId)) ?? null;
}

async function proveApiAuth(context: BrowserContext) {
  const response = await context.request.get(new URL("/api/auth/me", smokeUrl).toString());
  assert.equal(response.status(), 200, "/api/auth/me must return 200 for structured knowledge smoke");
  const payload = await response.json() as { data?: { email?: string; accessStatus?: string } };
  assert.ok(payload.data?.email, "authenticated user email must be present");
  if (expectedAdminEmail) {
    assert.equal(payload.data.email, expectedAdminEmail, "authenticated user email mismatch");
  }
  assert.equal(payload.data?.accessStatus, "active", "authenticated user must be active");
  pass("authenticated admin session is active");
}

async function selectSmokeProject(context: BrowserContext, projectId: string) {
  if (!projectId) {
    skipOrThrow("No project id was available for project selection.");
    return;
  }
  if (!isUuid(projectId)) {
    skipOrThrow(`Project selection skipped for local non-UUID project id ${projectId}.`);
    return;
  }
  const response = await context.request.post(new URL("/api/projects/select", smokeUrl).toString(), {
    data: { projectId },
    headers: requestIntegrityHeaders("/admin/knowledge"),
  });
  assert.equal(response.status(), 200, "/api/projects/select must accept the smoke project");
  pass(`selected project ${projectId}`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function checkedGet(context: BrowserContext, path: string): Promise<APIResponse> {
  const response = await context.request.get(new URL(path, smokeUrl).toString());
  assert.equal(response.status(), 200, `${path} must return 200`);
  return response;
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

  if (hasSupabaseSessionEnv()) {
    const jar = await createSupabaseSessionCookieJar();
    await context.addCookies([...jar.entries()].map(([name, value]) => ({
      name,
      value,
      url: smokeUrl.origin,
      sameSite: "Lax" as const,
    })));
  }
  return context;
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
  const linkResult = await admin.auth.admin.generateLink({ type: "magiclink", email: magicLinkAdminEmail });
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

function withCandidate(route: string, candidate: KnowledgeCandidate | null) {
  if (!candidate) {
    return route;
  }
  const url = new URL(route, smokeUrl);
  url.searchParams.set("candidateId", candidate.id);
  return `${url.pathname}${url.search}`;
}

function requestIntegrityHeaders(path: string) {
  return {
    origin: smokeUrl.origin,
    referer: new URL(path, smokeUrl).toString(),
  };
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
      url: smokeUrl.origin,
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

async function expectText(page: Page, text: string, label: string) {
  await page.locator("body").filter({ hasText: text }).waitFor({ state: "visible", timeout: 15000 });
  pass(label);
}

async function assertButtonEnabled(locator: ReturnType<Page["getByRole"]>, label: string) {
  await locator.waitFor({ state: "visible" });
  assert.equal(await locator.isDisabled(), false, `${label} must be enabled`);
}

function assertNoCollectedErrors() {
  assert.deepEqual(pageErrors, [], `page errors were collected: ${pageErrors.join(" | ")}`);
  assert.deepEqual(consoleErrors, [], `console errors were collected: ${consoleErrors.join(" | ")}`);
  assert.deepEqual(
    failedKnowledgeResponses,
    [],
    `failed /api/admin/knowledge responses were collected: ${failedKnowledgeResponses.join(" | ")}`,
  );
}

function assertNoReleaseSkips() {
  if (noSkip) {
    assert.deepEqual(skipped, [], `release smoke must not skip checks: ${skipped.join(" | ")}`);
  }
}

function skipOrThrow(message: string) {
  if (noSkip) {
    throw new Error(message);
  }
  skipped.push(message);
}

function hasSupabaseSessionEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function resolveSmokeUrl() {
  const explicit =
    process.env.STRUCTURED_KNOWLEDGE_SMOKE_URL?.trim() ||
    process.env.ARCHITECT_PREVIEW_URL?.trim() ||
    process.env.PREVIEW_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";
  return new URL(explicit.endsWith("/") ? explicit : `${explicit}/`);
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
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value.replace(/\\n$/, "").trim();
  }
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
  const message = error instanceof Error ? error.message : "structured knowledge Preview smoke failed";
  console.error(`structured-knowledge-preview-smoke-failed: ${message}`);
  process.exit(1);
});
