import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  id: string;
  status: CheckStatus;
  detail: string;
};

const root = process.cwd();
const fileEnv = readEnvFiles([".env", ".env.local"]);

const checks: Check[] = [
  checkEnv("DATABASE_URL", true, "AI review persistence and project_context retrieval require the database."),
  checkEnv("LAW_OPEN_DATA_OC", true, "Official-law verification blocks legal/regulation generation when absent."),
  checkEnv("VERIFIED_LEGAL_EVIDENCE_API_URL", false, "Optional verified legal bundle URL."),
  checkEnv("VERIFIED_LEGAL_EVIDENCE_API_SECRET", false, "Required when verified legal bundle or legal-search integration is enabled."),
  checkEnv("VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS", false, "Required when VERIFIED_LEGAL_EVIDENCE_API_URL is configured for bundle retrieval."),
  checkEnv("VERIFIED_LEGAL_SEARCH_API_URL", false, "Optional explicit verified legal search URL."),
  checkEnv("VERIFIED_LEGAL_SEARCH_ENABLED", false, "Set to 1 only when the server-to-server legal search API is reachable."),
];

const verifiedLegalEvidenceApiUrl = configuredEnvValue("VERIFIED_LEGAL_EVIDENCE_API_URL");
const verifiedLegalSearchApiUrl = configuredEnvValue("VERIFIED_LEGAL_SEARCH_API_URL");
const hasBundleUrl = hasConfiguredEnv("VERIFIED_LEGAL_EVIDENCE_API_URL");
const hasExplicitSearchUrl = hasConfiguredEnv("VERIFIED_LEGAL_SEARCH_API_URL");
const hasSearchEnabled = configuredEnvValue("VERIFIED_LEGAL_SEARCH_ENABLED") === "1";
const hasSearchUrl = hasExplicitSearchUrl || (hasSearchEnabled && hasBundleUrl);
const hasVerifiedLegalSecret = hasConfiguredEnv("VERIFIED_LEGAL_EVIDENCE_API_SECRET");
const hasBundleSourceIds = hasConfiguredEnv("VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS");
const configuredLegalApiUrl = verifiedLegalSearchApiUrl || verifiedLegalEvidenceApiUrl;
const isVercelRuntime = process.env.VERCEL === "1" || process.env.VERCEL === "true";

if (hasBundleUrl && !hasVerifiedLegalSecret) {
  checks.push({
    id: "verified-legal-bundle:secret",
    status: "fail",
    detail: "VERIFIED_LEGAL_EVIDENCE_API_URL requires VERIFIED_LEGAL_EVIDENCE_API_SECRET.",
  });
}

if (hasBundleUrl && !hasBundleSourceIds) {
  checks.push({
    id: "verified-legal-bundle:source-ids",
    status: "fail",
    detail: "VERIFIED_LEGAL_EVIDENCE_API_URL requires VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS for bundle retrieval.",
  });
}

if (hasSearchEnabled && !hasSearchUrl) {
  checks.push({
    id: "verified-legal-search:url",
    status: "fail",
    detail: "VERIFIED_LEGAL_SEARCH_ENABLED=1 requires VERIFIED_LEGAL_SEARCH_API_URL or VERIFIED_LEGAL_EVIDENCE_API_URL.",
  });
}

if (hasSearchUrl && !hasVerifiedLegalSecret) {
  checks.push({
    id: "verified-legal-search:secret",
    status: "fail",
    detail: "Verified legal search requires VERIFIED_LEGAL_EVIDENCE_API_SECRET.",
  });
}

if (isVercelRuntime && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(configuredLegalApiUrl)) {
  checks.push({
    id: "legal-search:loopback-preview",
    status: "fail",
    detail: "Vercel runtime must not point verified legal search at localhost or loopback.",
  });
}

const summaryStatus = checks.some((check) => check.status === "fail")
  ? "blocked"
  : checks.some((check) => check.status === "warn")
    ? "warning"
    : "ready";

console.log(JSON.stringify({ status: summaryStatus, checks }, null, 2));

if (summaryStatus === "blocked") {
  process.exitCode = 1;
}

function checkEnv(name: string, required: boolean, detail: string): Check {
  const configured = hasConfiguredEnv(name);
  if (configured) {
    return { id: `env:${name}`, status: "pass", detail: `${name} is configured. ${detail}` };
  }
  return {
    id: `env:${name}`,
    status: required ? "fail" : "warn",
    detail: `${name} is missing. ${detail}`,
  };
}

function hasConfiguredEnv(name: string): boolean {
  return configuredEnvValue(name).length > 0;
}

function configuredEnvValue(name: string): string {
  const runtimeValue = process.env[name]?.trim();
  if (runtimeValue) {
    return runtimeValue;
  }
  return fileEnv.get(name)?.trim() ?? "";
}

function readEnvFiles(fileNames: string[]): Map<string, string> {
  const entries = new Map<string, string>();
  for (const fileName of fileNames) {
    const filePath = join(root, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      entries.set(key, value);
    }
  }
  return entries;
}
