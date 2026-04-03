import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type CommandResult = {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  summary?: string;
};

type AgentStatus = {
  status?: string;
  generatedAt?: string;
  warnings?: Array<{ message: string; file?: string; line?: number }>;
  failures?: Array<{ message: string; file?: string; line?: number }>;
  commandResults?: Record<string, CommandResult | undefined>;
  updatedFiles?: string[];
  catalogFiles?: string[];
  appliedScreens?: string[];
  notes?: string[];
  cautionIdentifiers?: string[];
};

type StatusReadResult = {
  status: AgentStatus;
  errors: string[];
};

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "output", "ui-copy");
const TRANSLATOR_STATUS_PATH = path.join(OUTPUT_DIR, "translator-status.json");
const VALIDATOR_STATUS_PATH = path.join(OUTPUT_DIR, "validator-status.json");
const REPORT_PATH = path.join(ROOT, "docs", "UI_COPY_RUN_REPORT.md");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCommandResult(value: unknown): value is CommandResult {
  return isRecord(value)
    && typeof value.ok === "boolean"
    && (typeof value.exitCode === "number" || value.exitCode === null)
    && typeof value.durationMs === "number";
}

function readStatus(label: string, filePath: string): StatusReadResult {
  if (!existsSync(filePath)) {
    return {
      status: {},
      errors: [`${label} status file is missing: ${path.relative(ROOT, filePath)}`],
    };
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "");
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: {},
      errors: [`${label} status file is malformed: ${path.relative(ROOT, filePath)} (${message})`],
    };
  }

  if (!isRecord(parsed)) {
    return {
      status: {},
      errors: [`${label} status file must contain a JSON object: ${path.relative(ROOT, filePath)}`],
    };
  }

  const errors: string[] = [];
  if ("status" in parsed && typeof parsed.status !== "string") {
    errors.push(`${label} status field must be a string.`);
  }
  if ("generatedAt" in parsed && typeof parsed.generatedAt !== "string") {
    errors.push(`${label} generatedAt field must be a string.`);
  }
  if ("warnings" in parsed && !Array.isArray(parsed.warnings)) {
    errors.push(`${label} warnings field must be an array.`);
  }
  if ("failures" in parsed && !Array.isArray(parsed.failures)) {
    errors.push(`${label} failures field must be an array.`);
  }
  if ("commandResults" in parsed) {
    if (!isRecord(parsed.commandResults)) {
      errors.push(`${label} commandResults field must be an object.`);
    } else {
      for (const [key, value] of Object.entries(parsed.commandResults)) {
        if (value !== undefined && value !== null && !isCommandResult(value)) {
          errors.push(`${label} commandResults.${key} must be a structured command result.`);
        }
      }
    }
  }

  return {
    status: parsed as AgentStatus,
    errors,
  };
}

function commandLine(label: string, result?: CommandResult) {
  if (!result) return `- ${label}: not run`;
  return `- ${label}: ${result.ok ? "passed" : "failed"} (exit=${result.exitCode ?? "null"}, ${result.durationMs}ms)`;
}

const translatorResult = readStatus("translator", TRANSLATOR_STATUS_PATH);
const validatorResult = readStatus("validator", VALIDATOR_STATUS_PATH);
const translator = translatorResult.status;
const validator = validatorResult.status;
const statusErrors = [...translatorResult.errors, ...validatorResult.errors];
const reportGeneratedAt = new Date().toISOString();

const lines = [
  "# UI Copy Run Report",
  "",
  "## 변경된 카탈로그",
  ...(translator.catalogFiles?.length
    ? translator.catalogFiles.map((file) => `- ${file}`)
    : ["- translator-status.json is missing or does not list catalog files."]),
  "",
  "## 적용된 화면",
  ...(translator.appliedScreens?.length
    ? translator.appliedScreens.map((screen) => `- ${screen}`)
    : ["- translator-status.json is missing or does not list applied screens."]),
  "",
  "## 검증 결과",
  `- Report generatedAt: ${reportGeneratedAt}`,
  `- Translator agent status: ${translator.status ?? "unknown"}`,
  `- Translator generatedAt: ${translator.generatedAt ?? "unknown"}`,
  `- Validator agent status: ${validator.status ?? "unknown"}`,
  `- Validator generatedAt: ${validator.generatedAt ?? "unknown"}`,
  commandLine("typecheck", validator.commandResults?.typecheck),
  commandLine("lint", validator.commandResults?.lint),
  commandLine("build", validator.commandResults?.build),
  validator.failures?.length ? `- Failure count: ${validator.failures.length}` : "- Failure count: 0",
  "",
  "## 남은 경고",
  ...((validator.warnings?.length ?? 0) > 0
    ? validator.warnings!.map((warning) => `- ${warning.file ? `${warning.file}${warning.line ? `:${warning.line}` : ""} ` : ""}${warning.message}`)
    : ["- 없음"]),
  "",
  "## 영어 UI 전환 시 주의 식별자",
  ...((translator.cautionIdentifiers?.length ?? 0) > 0
    ? translator.cautionIdentifiers!.map((value) => `- ${value}`)
    : [
        "- Routes: /board, /daily, /calendar, /trash",
        "- TaskStatus: new, in_review, in_discussion, blocked, done",
        "- Field keys: actionId, dueDate, coordinationScope, requestedBy, relatedDisciplines, locationRef, calendarLinked, issueDetailNote, statusHistory",
        "- API payload aliases in src/app/api/tasks/route.ts",
        "- Prisma enums and localStorage keys must remain English identifiers.",
      ]),
  "",
  ...(statusErrors.length > 0 ? ["## 상태 파일 오류", ...statusErrors.map((error) => `- ${error}`), ""] : []),
  ...(translator.notes?.length ? ["## Notes", ...translator.notes.map((note) => `- ${note}`), ""] : []),
].join("\n");

mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, lines + "\n", "utf8");

console.log("[ui-copy-report] report written to docs/UI_COPY_RUN_REPORT.md");
console.log(`[ui-copy-report] translator=${translator.status ?? "unknown"} validator=${validator.status ?? "unknown"}`);
if (statusErrors.length > 0) {
  console.error(`[ui-copy-report] status file errors=${statusErrors.length}`);
  process.exit(1);
}
process.exit(0);
