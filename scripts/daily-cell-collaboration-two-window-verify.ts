import assert from "node:assert/strict";

type Options = {
  url: string;
};

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

async function main() {
  const options = parseOptions(process.argv.slice(2));
  assert.ok(options.url, "--url is required");
  const url = new URL(options.url);
  assert.equal(url.pathname, "/daily", "two-window proof must target the DB-backed /daily route");

  let playwright: any = null;
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
    playwright = await dynamicImport("playwright");
  } catch {
    throw new Error("Playwright is required for two-window browser verification.");
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  try {
    await Promise.all([pageA.goto(url.toString(), { waitUntil: "domcontentloaded" }), pageB.goto(url.toString(), { waitUntil: "domcontentloaded" })]);
    const [titleA, titleB] = await Promise.all([pageA.title(), pageB.title()]);
    console.log(
      JSON.stringify(
        {
          ok: true,
          url: url.toString(),
          openedTwoWindows: true,
          titles: [titleA, titleB],
          note: "Authenticated edit/merge proof requires a logged-in browser profile and Preview feature flag activation.",
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
