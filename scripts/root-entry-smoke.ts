import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import { chromium, type BrowserContext, type BrowserContextOptions } from "playwright";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
loadPreviewEnvFile();

type RouteResult = {
  route: string;
  finalUrl: string;
  title: string;
  bodyPreview: string;
};

type CookieJar = Map<string, string>;
type SmokeBrowser = Awaited<ReturnType<typeof chromium.launch>>;

const routes = ["/", "/auth/post-login", "/board", "/daily"] as const;
const workspaceEntryPathnames = new Set(["/admin", "/board", "/calendar", "/daily", "/materials", "/trash"]);
const magicLinkAdminEmail =
  process.env.ARCHITECT_ADMIN_EMAIL?.trim() || process.env.PREVIEW_ADMIN_EMAIL?.trim() || "gudc083111@gmail.com";

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const context = await createSmokeContext(browser, options.baseUrl);
  const results: RouteResult[] = [];

  try {
    for (const route of routes) {
      results.push(await smokeRoute(context, options.baseUrl, route, options.timeoutMs, context.expectsAuthenticatedWorkspace));
    }
  } finally {
    await browser.close();
  }

  console.log(
    JSON.stringify(
      {
        status: "root-entry-smoke-pass",
        baseUrl: options.baseUrl.origin,
        routes: results,
      },
      null,
      2,
    ),
  );
}

async function createSmokeContext(browser: SmokeBrowser, baseUrl: URL) {
  const context = await browser.newContext(buildContextOptions(baseUrl));
  let expectsAuthenticatedWorkspace = hasExplicitAuthState();
  if (!hasExplicitAuthState() && hasSupabaseSessionEnv()) {
    const jar = await createSupabaseSessionCookieJar(baseUrl);
    await context.addCookies([...jar.entries()].map(([name, value]) => ({
      name,
      value,
      url: baseUrl.origin,
      sameSite: "Lax" as const,
    })));
    expectsAuthenticatedWorkspace = true;
  }
  return Object.assign(context, { expectsAuthenticatedWorkspace });
}

async function smokeRoute(
  context: BrowserContext,
  baseUrl: URL,
  route: (typeof routes)[number],
  timeoutMs: number,
  expectsAuthenticatedWorkspace: boolean,
) {
  const page = await context.newPage();
  const diagnostics: string[] = [];

  page.on("pageerror", (error) => {
    diagnostics.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.push(`console error: ${message.text()}`);
    }
  });

  const targetUrl = new URL(route, baseUrl).toString();
  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);
  await page.waitForTimeout(750);

  const bodyText = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")).trim();
  const title = await page.title().catch(() => "");
  const finalUrl = page.url();
  const hasFrameworkOverlay =
    bodyText.includes("Runtime Error") ||
    bodyText.includes("This page couldn") ||
    bodyText.includes("Rendered more hooks than during the previous render") ||
    bodyText.includes("Unhandled Runtime Error");

  assert.ok(response, `${route} did not produce a browser response`);
  assert.ok(bodyText.length > 0, `${route} rendered a blank document at ${finalUrl}`);
  assert.equal(hasFrameworkOverlay, false, `${route} rendered a framework error overlay at ${finalUrl}`);
  assert.deepEqual(diagnostics, [], `${route} emitted browser errors:\n${diagnostics.join("\n")}`);

  if (route === "/") {
    assert.notEqual(new URL(finalUrl).pathname, "/", "/ must leave the root entry after server-side destination resolution");
  }
  assertAuthenticatedWorkspaceDestination(route, finalUrl, expectsAuthenticatedWorkspace);

  await page.close();

  return {
    route,
    finalUrl,
    title,
    bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 160),
  } satisfies RouteResult;
}

function assertAuthenticatedWorkspaceDestination(
  route: (typeof routes)[number],
  finalUrl: string,
  expectsAuthenticatedWorkspace: boolean,
) {
  if (!expectsAuthenticatedWorkspace) {
    return;
  }

  const finalPathname = new URL(finalUrl).pathname;
  assert.notEqual(finalPathname, "/login", `${route} must not fall back to login when smoke auth is configured`);

  if (route === "/board" || route === "/daily") {
    assert.equal(finalPathname, route, `${route} must stay on ${route} when smoke auth is configured`);
    return;
  }

  assert.equal(
    workspaceEntryPathnames.has(finalPathname),
    true,
    `${route} must resolve to a workspace destination when smoke auth is configured; got ${finalPathname}`,
  );
}

function parseOptions(argv: string[]) {
  return {
    baseUrl: normalizeBaseUrl(
      readOptionValue(argv, "--url") ||
        process.env.ROOT_ENTRY_SMOKE_URL ||
        process.env.PREVIEW_BASE_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        "http://localhost:3000",
    ),
    timeoutMs: readPositiveInteger(readOptionValue(argv, "--timeout-ms") || process.env.ROOT_ENTRY_SMOKE_TIMEOUT_MS, 20_000),
  };
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  return new URL(url.origin);
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
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

function buildContextOptions(baseUrl: URL): BrowserContextOptions {
  const storageStatePath = process.env.ARCHITECT_SMOKE_STORAGE_STATE?.trim();
  const rawCookie = process.env.ARCHITECT_SMOKE_COOKIE?.trim();
  const bypassToken = process.env.VERCEL_BYPASS_TOKEN?.trim() || process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const options: BrowserContextOptions = {};

  if (bypassToken) {
    options.extraHTTPHeaders = {
      "x-vercel-protection-bypass": bypassToken,
    };
  }

  if (storageStatePath) {
    const absolutePath = resolve(process.cwd(), storageStatePath);
    if (!existsSync(absolutePath)) {
      throw new Error("ARCHITECT_SMOKE_STORAGE_STATE does not point to an existing file");
    }

    options.storageState = absolutePath;
  }

  if (rawCookie) {
    options.extraHTTPHeaders = {
      ...options.extraHTTPHeaders,
      cookie: rawCookie,
    };
  }

  options.baseURL = baseUrl.origin;
  return options;
}

function hasExplicitAuthState() {
  return Boolean(process.env.ARCHITECT_SMOKE_STORAGE_STATE?.trim() || process.env.ARCHITECT_SMOKE_COOKIE?.trim());
}

function hasSupabaseSessionEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

async function createSupabaseSessionCookieJar(baseUrl: URL) {
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
