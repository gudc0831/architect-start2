import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const { uiCopyCatalog } = (await import(new URL("../src/lib/ui-copy/catalog.ts", import.meta.url).href)) as {
  uiCopyCatalog: Record<string, unknown>;
};

type CommandResult = {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  summary: string;
};

type Finding = {
  check: string;
  message: string;
  file?: string;
  line?: number;
};

type ExternalCommandResults = {
  typecheck?: CommandResult;
  lint?: CommandResult;
  build?: CommandResult | null;
  lastChangedPaths?: string[];
};

type ValidatorStatus = {
  agent: "UI Copy Validator Agent";
  mode: "once" | "watch";
  status: "passed" | "failed" | "watching";
  generatedAt: string;
  watchedTargets: string[];
  lastChangedPaths: string[];
  commandResults: {
    typecheck?: CommandResult;
    lint?: CommandResult;
    build?: CommandResult;
  };
  cycles: number;
  warnings: Finding[];
  failures: Finding[];
  latestWarnings: Finding[];
  latestFailures: Finding[];
};

type CommandResultsValidation = {
  results: ExternalCommandResults;
  failures: Finding[];
};

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "output", "ui-copy");
const STATUS_PATH = path.join(OUTPUT_DIR, "validator-status.json");
const WATCH_MODE = process.argv.includes("--watch");
const commandResultsPathIndex = process.argv.indexOf("--command-results");
const commandResultsPath = commandResultsPathIndex >= 0 ? process.argv[commandResultsPathIndex + 1] : null;
const WATCH_TARGETS = [
  "src/components",
  "src/app",
  "src/providers",
  "src/lib/ui-copy",
  "src/lib/preview",
  "src/lib/api",
  "src/lib/auth",
];
const UI_SCAN_DIRS = ["src/components", "src/app", "src/providers"];
const protectedRules: Array<{ file: string; required: string[] }> = [
  { file: "middleware.ts", required: ["/board"] },
  { file: "src/components/layout/sidebar.tsx", required: ["/board", "/daily", "/calendar", "/trash"] },
  { file: "src/domains/task/types.ts", required: ["\"board\"", "\"daily\"", "\"calendar\"", "\"trash\""] },
  { file: "src/domains/task/status.ts", required: ["\"new\"", "\"in_review\"", "\"in_discussion\"", "\"blocked\"", "\"done\"", "waiting", "todo", "in_progress"] },
  { file: "src/domains/preferences/types.ts", required: ["\"actionId\"", "\"dueDate\"", "\"workType\"", "\"coordinationScope\"", "\"requestedBy\"", "\"relatedDisciplines\"", "\"assignee\"", "\"issueTitle\"", "\"reviewedAt\"", "\"locationRef\"", "\"calendarLinked\"", "\"issueDetailNote\"", "\"status\"", "\"completedAt\"", "\"statusHistory\"", "\"decision\""] },
  { file: "prisma/schema.prisma", required: ["new", "in_review", "in_discussion", "blocked", "done"] },
  { file: "src/app/api/tasks/route.ts", required: ["dueDate", "due_date", "Coordination Scope", "Owner Discipline", "requested_by", "Related Disciplines", "issue_title", "reviewed_at", "Location Ref", "Calendar Linked", "ISSUE Detail Note", "status"] },
];
const rawDisplayRules: Array<{ check: string; regex: RegExp }> = [
  { check: "raw-role-display", regex: /\{authUser(?:\?|\.)\.role\}/ },
  { check: "raw-project-source-display", regex: /\{projectSource(?:\s*\?\?[^}]*)?\}/ },
  { check: "raw-data-mode-display", regex: /\{systemMode\.dataMode\}/ },
  { check: "raw-upload-mode-display", regex: /\{systemMode\.uploadMode\}/ },
  { check: "raw-status-history-display", regex: /\{task\.statusHistory(?:\s*\|\|[^}]*)?\}|value=\{form\.statusHistory(?:\s*\|\|[^}]*)?\}/ },
  { check: "raw-api-message-display", regex: /json\.error\?\.message/ },
];
const uiCatalogValues = new Set<string>();
collectCatalogValues(uiCopyCatalog, uiCatalogValues);

function normalize(value: string) {
  return value.replace(/\\/g, "/");
}

function ensureOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function relativeToRoot(filePath: string) {
  return normalize(path.relative(ROOT, filePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCommandResult(value: unknown): value is CommandResult {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.ok === "boolean"
    && (typeof value.exitCode === "number" || value.exitCode === null)
    && typeof value.durationMs === "number"
    && Number.isFinite(value.durationMs)
    && typeof value.summary === "string";
}

function readPreviousCycles() {
  if (!WATCH_MODE || !existsSync(STATUS_PATH)) {
    return 0;
  }

  try {
    const raw = readFileSync(STATUS_PATH, "utf8").replace(/^\uFEFF/u, "");
    const parsed = JSON.parse(raw) as { cycles?: unknown };
    return typeof parsed.cycles === "number" && Number.isFinite(parsed.cycles) ? parsed.cycles : 0;
  } catch {
    return 0;
  }
}

function readExternalCommandResults(): CommandResultsValidation {
  if (!commandResultsPath) {
    return { results: {}, failures: [] };
  }

  const absolute = path.isAbsolute(commandResultsPath) ? commandResultsPath : path.join(ROOT, commandResultsPath);
  const relativePath = relativeToRoot(absolute);
  if (!existsSync(absolute)) {
    return {
      results: {},
      failures: [{ check: "command-results-missing", file: relativePath, message: `Command results file not found: ${relativePath}` }],
    };
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(absolute, "utf8").replace(/^\uFEFF/u, "");
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      results: {},
      failures: [{ check: "command-results-json", file: relativePath, message: `Failed to parse command results JSON: ${message}` }],
    };
  }

  if (!isRecord(parsed)) {
    return {
      results: {},
      failures: [{ check: "command-results-shape", file: relativePath, message: "Command results payload must be an object." }],
    };
  }

  const results: ExternalCommandResults = {};
  const failures: Finding[] = [];

  for (const key of ["typecheck", "lint"] as const) {
    if (!(key in parsed)) {
      failures.push({ check: "command-results-shape", file: relativePath, message: `Missing structured result for ${key}.` });
      continue;
    }

    const value = parsed[key];
    if (!isCommandResult(value)) {
      failures.push({
        check: "command-results-shape",
        file: relativePath,
        message: `Malformed command result for ${key}: expected { ok, exitCode, durationMs, summary }.`,
      });
      continue;
    }

    results[key] = value;
  }

  if ("build" in parsed) {
    const buildValue = parsed.build;
    if (buildValue === null) {
      results.build = null;
    } else if (isCommandResult(buildValue)) {
      results.build = buildValue;
    } else {
      failures.push({
        check: "command-results-shape",
        file: relativePath,
        message: "Malformed command result for build: expected { ok, exitCode, durationMs, summary } or null.",
      });
    }
  }

  if ("lastChangedPaths" in parsed) {
    const value = parsed.lastChangedPaths;
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
      results.lastChangedPaths = value;
    } else {
      failures.push({
        check: "command-results-shape",
        file: relativePath,
        message: "Malformed command result metadata: lastChangedPaths must be a string array.",
      });
    }
  }

  if (results.typecheck?.ok === true && results.lint?.ok === true && !results.build) {
    failures.push({
      check: "command-results-shape",
      file: relativePath,
      message: "Missing structured build result after successful typecheck and lint.",
    });
  }

  return { results, failures };
}

function listFiles(targetPath: string): string[] {
  const absolute = path.join(ROOT, targetPath);
  if (!existsSync(absolute)) return [];
  const stat = statSync(absolute);
  if (stat.isFile()) return [absolute];

  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const next = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path.relative(ROOT, next)));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/u.test(entry.name)) continue;
    files.push(next);
  }
  return files;
}

function uniqueFindings(findings: Finding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = [finding.check, finding.file ?? "", finding.line ?? 0, finding.message].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareCatalogShape(left: unknown, right: unknown, prefix = ""): Finding[] {
  const failures: Finding[] = [];
  if (typeof left === "string" || typeof right === "string") {
    if (typeof left !== typeof right) {
      failures.push({ check: "catalog-shape", message: `Catalog leaf mismatch at ${prefix}` });
    }
    return failures;
  }

  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    if (left !== right) {
      failures.push({ check: "catalog-shape", message: `Catalog node mismatch at ${prefix}` });
    }
    return failures;
  }

  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightKeys = Object.keys(right as Record<string, unknown>);
  for (const key of leftKeys) {
    if (!rightKeys.includes(key)) {
      failures.push({ check: "catalog-shape", message: `Missing key in en catalog: ${prefix}${key}` });
      continue;
    }
    failures.push(...compareCatalogShape((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], `${prefix}${key}.`));
  }
  for (const key of rightKeys) {
    if (!leftKeys.includes(key)) {
      failures.push({ check: "catalog-shape", message: `Missing key in ko catalog: ${prefix}${key}` });
    }
  }
  return failures;
}

function collectCatalogValues(node: unknown, values: Set<string>) {
  if (typeof node === "string") {
    const trimmed = node.trim();
    const hasHangul = /[가-힣]/u.test(trimmed);
    if (trimmed && !trimmed.includes("{{") && (hasHangul || trimmed.length >= 4)) {
      values.add(trimmed);
    }
    return;
  }

  if (!node || typeof node !== "object") return;
  for (const value of Object.values(node as Record<string, unknown>)) {
    collectCatalogValues(value, values);
  }
}

function extractStringLiterals(line: string) {
  const literals: string[] = [];
  const regex = /(["'`])((?:\\.|(?!\1).)*?)\1/g;
  for (const match of line.matchAll(regex)) {
    literals.push(match[2] ?? "");
  }
  return literals;
}

function shouldIgnoreLiteral(file: string, line: string, literal: string) {
  const trimmed = literal.trim();
  if (!trimmed) return true;
  if (line.trim().startsWith("import ")) return true;
  if (trimmed.includes("${")) return true;
  if (trimmed.startsWith("@/") || trimmed.startsWith("../") || trimmed.startsWith("./")) return true;
  if (trimmed.startsWith("/")) return true;
  if (/^(board|daily|calendar|trash|new|in_review|in_discussion|blocked|done|waiting|todo|in_progress)$/u.test(trimmed)) return true;
  if (/^[a-z0-9_.:-]+$/u.test(trimmed)) return true;
  if (trimmed.includes("Content-Type")) return true;
  if (relativeToRoot(file) === "src/providers/project-provider.tsx" && trimmed === "Project") return true;
  return false;
}

function isUiScanFile(filePath: string) {
  const relative = relativeToRoot(filePath);
  if (relative.includes("/api/")) return false;
  if (relative.startsWith("src/lib/ui-copy/")) return false;
  return true;
}

function runHardcodedStringCheck(): Finding[] {
  const failures: Finding[] = [];
  const files = UI_SCAN_DIRS.flatMap((target) => listFiles(target)).filter(isUiScanFile);

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const literal of extractStringLiterals(line)) {
        const value = literal.trim();
        if (shouldIgnoreLiteral(file, line, value)) continue;
        if (!uiCatalogValues.has(value)) continue;
        failures.push({
          check: "hardcoded-ui-string",
          file: relativeToRoot(file),
          line: index + 1,
          message: `Hardcoded UI copy found: ${JSON.stringify(value)}`,
        });
      }
    });
  }

  return uniqueFindings(failures);
}

function runProtectedIdentifierCheck(): Finding[] {
  const failures: Finding[] = [];
  for (const rule of protectedRules) {
    const absolute = path.join(ROOT, rule.file);
    const text = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
    for (const token of rule.required) {
      if (!text.includes(token)) {
        failures.push({
          check: "protected-identifier",
          file: normalize(rule.file),
          message: `Missing protected identifier: ${token}`,
        });
      }
    }
  }
  return failures;
}

function runRawDisplayCheck(): Finding[] {
  const warnings: Finding[] = [];
  const files = WATCH_TARGETS.flatMap((target) => listFiles(target));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const rule of rawDisplayRules) {
      const match = text.match(rule.regex);
      if (!match) continue;
      warnings.push({
        check: rule.check,
        file: relativeToRoot(file),
        line: text.slice(0, text.indexOf(match[0])).split(/\r?\n/).length,
        message: `Potential raw UI leak: ${match[0]}`,
      });
    }
  }
  return uniqueFindings(warnings);
}

function buildStatus(): ValidatorStatus {
  const commandResultsValidation = readExternalCommandResults();
  const commandResults = commandResultsValidation.results;
  const failures = uniqueFindings([
    ...commandResultsValidation.failures,
    ...compareCatalogShape((uiCopyCatalog as Record<string, unknown>).ko, (uiCopyCatalog as Record<string, unknown>).en),
    ...runHardcodedStringCheck(),
    ...runProtectedIdentifierCheck(),
  ]);
  const warnings = runRawDisplayCheck();
  const commandResultsRequired = Boolean(commandResultsPath);
  const typecheckOk = commandResults.typecheck?.ok === true;
  const lintOk = commandResults.lint?.ok === true;
  const buildOk = !commandResults.build || commandResults.build.ok === true;
  const commandsPassed = commandResultsRequired ? typecheckOk && lintOk && buildOk : true;
  const status = failures.length === 0 && commandsPassed
    ? (WATCH_MODE ? "watching" : "passed")
    : "failed";

  return {
    agent: "UI Copy Validator Agent",
    mode: WATCH_MODE ? "watch" : "once",
    status,
    generatedAt: new Date().toISOString(),
    watchedTargets: WATCH_TARGETS,
    lastChangedPaths: commandResults.lastChangedPaths ?? [],
    commandResults: {
      typecheck: commandResults.typecheck,
      lint: commandResults.lint,
      build: commandResults.build ?? undefined,
    },
    cycles: WATCH_MODE ? readPreviousCycles() + 1 : 1,
    warnings,
    failures,
    latestWarnings: warnings,
    latestFailures: failures,
  };
}

const status = buildStatus();
ensureOutputDir();
writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + "\n", "utf8");
console.log(`[ui-copy-validator] status=${status.status} warnings=${status.warnings.length} failures=${status.failures.length}`);
if (status.commandResults.typecheck) console.log(`[ui-copy-validator] typecheck=${status.commandResults.typecheck.ok ? "ok" : "failed"}`);
if (status.commandResults.lint) console.log(`[ui-copy-validator] lint=${status.commandResults.lint.ok ? "ok" : "failed"}`);
if (status.commandResults.build) console.log(`[ui-copy-validator] build=${status.commandResults.build.ok ? "ok" : "failed"}`);
process.exit(status.status === "failed" ? 1 : 0);
