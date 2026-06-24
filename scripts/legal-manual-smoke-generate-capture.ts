import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

type SmokeCapture = {
  id: string;
  question: string;
  capturedAt: string;
  generated: unknown;
};

async function main() {
  const appUrl = readArgValue("--app-url");
  const rawOutputPath = readArgValue("--output");
  const rawCapturesOutputPath = readArgValue("--captures-output");
  if (!appUrl?.trim() || !rawOutputPath) {
    throw new Error("Usage: npm run legal-manual-smoke:generate-capture -- --app-url <architect-saas-url> --output <report.json>");
  }

  const outputPath = resolveCliOutputPath(rawOutputPath, "--output");
  const capturesOutputPath = rawCapturesOutputPath
    ? resolveCliOutputPath(rawCapturesOutputPath, "--captures-output")
    : undefined;
  const report = await generateReport({ appUrl: appUrl.trim(), capturesOutputPath });
  await writeJsonOutput(outputPath, report);
}

async function generateReport(input: { appUrl: string; capturesOutputPath?: string }) {
  const {
    buildAssistantLegalManualSmokeReportFromCaptures,
    canonicalAssistantLegalManualSmokeCases,
    validateAssistantLegalManualSmokeReport,
  } = await import("../src/domains/assistant/legal-manual-smoke-report");
  const appUrl = normalizeAppUrl(input.appUrl);
  await putJson(appUrl, "/api/admin/assistant/policy", {
    enabled: true,
    provider: "mock",
    model: "deterministic-foundation",
    monthlyBudgetCents: 1000000,
    maxInputTokens: 12000,
    maxOutputTokens: 2000,
    externalEvidenceAllowed: true,
    allowedEvidenceKinds: ["central_knowledge", "project_wiki", "regulation", "task", "project_document", "web_or_skill"],
  });

  const captures: SmokeCapture[] = [];
  for (const smokeCase of canonicalAssistantLegalManualSmokeCases) {
    const task = await postJson<{ id: string }>(appUrl, "/api/tasks", {
      dueDate: "",
      workType: "review",
      coordinationScope: "",
      ownerDiscipline: "",
      requestedBy: "",
      relatedDisciplines: "",
      assignee: "",
      assigneeProfileId: null,
      issueTitle: `Legal smoke: ${smokeCase.id}`,
      reviewedAt: "",
      isDaily: true,
      locationRef: smokeCase.id === "seoul-site-open-space" ? "\uC11C\uC6B8" : "",
      calendarLinked: false,
      issueDetailNote: smokeCase.question,
      status: "new",
      decision: "",
    });
    const generated = await postJson(appUrl, "/api/assistant/generate", {
      taskId: task.id,
      question: smokeCase.question,
      instruction: "Answer for legal manual smoke. Keep source title, source kind, authority rank, effective date or stale warning, source URL or locator, and confidence reason visible.",
    });
    captures.push({
      id: smokeCase.id,
      question: smokeCase.question,
      capturedAt: new Date().toISOString(),
      generated,
    });
  }

  const report = buildAssistantLegalManualSmokeReportFromCaptures(captures);
  const validation = validateAssistantLegalManualSmokeReport(report);
  process.stderr.write(`${JSON.stringify(validation, null, 2)}\n`);
  if (validation.status !== "passed") {
    throw new Error(`Generated assistant manual-smoke report failed validation: ${validation.failures.join("; ")}`);
  }
  if (input.capturesOutputPath) {
    await writeJsonOutput(input.capturesOutputPath, {
      generatedAt: report.generatedAt,
      captures: report.smokeCases,
    });
  }
  return report;
}

async function putJson<T = unknown>(appUrl: URL, path: string, body: Record<string, unknown>): Promise<T> {
  return requestJson(appUrl, "PUT", path, body);
}

async function postJson<T = unknown>(appUrl: URL, path: string, body: Record<string, unknown>): Promise<T> {
  return requestJson(appUrl, "POST", path, body);
}

async function requestJson<T>(appUrl: URL, method: "POST" | "PUT", path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(new URL(path, appUrl), {
    method,
    headers: {
      "content-type": "application/json",
      origin: appUrl.origin,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as {
    data?: unknown;
    error?: { message?: string; code?: string };
    debug?: unknown;
  };
  if (!response.ok) {
    const message = payload.error?.message ?? `${method} ${path} failed with HTTP ${response.status}`;
    const code = payload.error?.code ? `${payload.error.code}: ` : "";
    const debug = payload.debug ? ` ${JSON.stringify(payload.debug)}` : "";
    throw new Error(`${code}${message}${debug}`);
  }
  return payload.data as T;
}

function normalizeAppUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--app-url must be an http(s) URL");
  }
  return url;
}

function readArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1]?.trim();
  return value || undefined;
}

function resolveCliOutputPath(value: string, argName: string) {
  const targetPath = resolve(value.trim());
  const cwd = resolve(process.cwd());
  const relativePath = relative(cwd, targetPath);
  if (relativePath.startsWith("..") || relativePath.includes(":")) {
    throw new Error(`${argName} must stay under the current repository directory.`);
  }
  return targetPath;
}

async function writeJsonOutput(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
