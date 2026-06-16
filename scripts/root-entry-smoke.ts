import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type BrowserContext, type BrowserContextOptions } from "playwright";

type RouteResult = {
  route: string;
  finalUrl: string;
  title: string;
  bodyPreview: string;
};

const routes = ["/", "/auth/post-login", "/board", "/daily"] as const;

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(buildContextOptions(options.baseUrl));
  const results: RouteResult[] = [];

  try {
    for (const route of routes) {
      results.push(await smokeRoute(context, options.baseUrl, route, options.timeoutMs));
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

async function smokeRoute(
  context: BrowserContext,
  baseUrl: URL,
  route: string,
  timeoutMs: number,
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

  await page.close();

  return {
    route,
    finalUrl,
    title,
    bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 160),
  } satisfies RouteResult;
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
