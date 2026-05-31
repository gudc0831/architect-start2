import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssistantRetrievedEvidenceSnapshot } from "../src/domains/assistant/saas-api-mode";
import {
  buildAssistantLegalManualSmokeReportFromCaptures,
  canonicalAssistantLegalManualSmokeCases,
  legalManualSmokeRequiredAnswerFields,
  validateAssistantLegalManualSmokeReport,
} from "../src/domains/assistant/legal-manual-smoke-report";

async function main() {
  assert.equal(canonicalAssistantLegalManualSmokeCases.length, 5);
  assert.deepEqual(legalManualSmokeRequiredAnswerFields, [
    "source title",
    "source kind",
    "authority rank",
    "effective date or stale warning",
    "source URL or locator",
    "confidence reason",
  ]);

  const previousLawOpenDataOc = process.env.LAW_OPEN_DATA_OC;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  try {
    process.env.LAW_OPEN_DATA_OC = "manual-smoke-oc-secret";
    process.env.OPENAI_API_KEY = ["sk", "manual", "smoke"].join("-");

    const captures = canonicalAssistantLegalManualSmokeCases.map((smokeCase, index) => ({
      id: smokeCase.id,
      question: smokeCase.question,
      generated: {
        answer: `assistant answer ${index + 1}`,
        retrieval: buildRetrievalSnapshot({
          taskId: `task:${index + 1}`,
          sourceKind: index === 1 ? "molitInterpretation" : "statute",
          authorityRank: index === 1 ? "ministry_interpretation" : "statute",
          sourceUrl: index === 0
            ? `https://open.law.go.kr/LSO/lawService.do?OC${"="}manual-smoke-oc-secret&target=law`
            : undefined,
          locator: {
            article: String(index + 1),
            [`OC${"="}manual-smoke-oc-secret`]: "must not leak",
            nested: { safe: true, oc: "must not leak" },
          },
          confidenceReason: `Answer-ready legal evidence ${index + 1}; no ${process.env.OPENAI_API_KEY} leak.`,
        }),
      },
    }));

    const report = buildAssistantLegalManualSmokeReportFromCaptures(captures, {
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    assert.equal(report.status, "ready_for_validation");
    assert.equal(report.captureSource, "assistant-generate-retrieval");
    assert.equal(report.credentialedSmokeComplete, false);
    assert.equal(report.smokeCases.length, 5);
    assert.deepEqual(report.smokeCases.map((smokeCase) => smokeCase.id), canonicalAssistantLegalManualSmokeCases.map((smokeCase) => smokeCase.id));
    assert.ok(report.smokeCases.every((smokeCase) => smokeCase.answerFields.every((field) => field.value.trim())));
    assert.ok(report.smokeCases.every((smokeCase) => smokeCase.answerFields.every((field) => field.required === true)));
    assert.equal(
      report.smokeCases[0]?.answerFields.find((field) => field.name === "source URL or locator")?.value,
      "https://open.law.go.kr/LSO/lawService.do?target=law",
    );
    assert.match(
      report.smokeCases[1]?.answerFields.find((field) => field.name === "source title")?.value ?? "",
      /MOLIT interpretation/,
    );
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(`OC${"="}`), false);
    assert.equal(serialized.includes("manual-smoke-oc-secret"), false);
    assert.equal(serialized.includes(process.env.OPENAI_API_KEY), false);
    assert.equal(serialized.includes("must not leak"), false);
    assert.equal(validateAssistantLegalManualSmokeReport(report).status, "passed");

    const invalidTopLevelReport = {
      ...report,
      status: "complete",
      captureSource: "manual-entry",
      credentialedSmokeComplete: true,
      generatedAt: "",
    };
    const invalidTopLevelValidation = validateAssistantLegalManualSmokeReport(invalidTopLevelReport);
    assert.equal(invalidTopLevelValidation.status, "failed");
    assert.ok(invalidTopLevelValidation.failures.some((failure) => failure.includes("status is invalid")));
    assert.ok(invalidTopLevelValidation.failures.some((failure) => failure.includes("captureSource is invalid")));
    assert.ok(invalidTopLevelValidation.failures.some((failure) => failure.includes("credentialedSmokeComplete must remain false")));
    assert.ok(invalidTopLevelValidation.failures.some((failure) => failure.includes("generatedAt is required")));

    const invalidDerivedStatusReport = {
      ...report,
      status: "needs_capture",
    };
    const invalidDerivedStatusValidation = validateAssistantLegalManualSmokeReport(invalidDerivedStatusReport);
    assert.equal(invalidDerivedStatusValidation.status, "failed");
    assert.ok(invalidDerivedStatusValidation.failures.some((failure) => failure.includes("status does not match derived readiness")));

    const spacedOcReport = {
      ...report,
      smokeCases: report.smokeCases.map((smokeCase, caseIndex) => caseIndex === 0 ? {
        ...smokeCase,
        answerFields: smokeCase.answerFields.map((field) => field.name === "confidence reason"
          ? { ...field, value: "credential-like text OC = unconfigured-secret" }
          : field),
      } : smokeCase),
    };
    const spacedOcValidation = validateAssistantLegalManualSmokeReport(spacedOcReport);
    assert.equal(spacedOcValidation.status, "failed");
    assert.ok(spacedOcValidation.failures.some((failure) => failure.includes("credential-like value")));

    const missingEvidenceReport = buildAssistantLegalManualSmokeReportFromCaptures([
      {
        id: canonicalAssistantLegalManualSmokeCases[0]!.id,
        question: canonicalAssistantLegalManualSmokeCases[0]!.question,
        generated: {
          answer: "assistant answer without legal evidence",
          retrieval: buildRetrievalSnapshot({ taskId: "task:missing", legalEvidence: false }),
        },
      },
    ]);
    const missingEvidenceValidation = validateAssistantLegalManualSmokeReport(missingEvidenceReport);
    assert.equal(missingEvidenceValidation.status, "failed");
    assert.ok(missingEvidenceValidation.failures.some((failure) => failure.includes("missing assistant legal evidence")));
  } finally {
    restoreEnv("LAW_OPEN_DATA_OC", previousLawOpenDataOc);
    restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
  }

  const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
  assert.equal(packageJson.scripts?.["legal-manual-smoke:capture"], "tsx scripts/legal-manual-smoke-capture.ts");
  assert.equal(packageJson.scripts?.["legal-manual-smoke:generate-capture"], "tsx scripts/legal-manual-smoke-generate-capture.ts");
  assert.equal(packageJson.scripts?.["legal-manual-smoke:validate"], "tsx scripts/legal-manual-smoke-report-validate.ts");
  const captureScript = await readFile(join(process.cwd(), "scripts", "legal-manual-smoke-capture.ts"), "utf8");
  assert.match(captureScript, /buildAssistantLegalManualSmokeReportFromCaptures/);
  assert.match(captureScript, /--input <assistant-captures\.json>/);
  assert.match(captureScript, /validateAssistantLegalManualSmokeReport/);
  assert.match(captureScript, /stripJsonBom/);
  const generateCaptureScript = await readFile(join(process.cwd(), "scripts", "legal-manual-smoke-generate-capture.ts"), "utf8");
  assert.match(generateCaptureScript, /--app-url <architect-saas-url>/);
  assert.match(generateCaptureScript, /\/api\/assistant\/generate/);
  assert.match(generateCaptureScript, /\/api\/admin\/assistant\/policy/);
  assert.match(generateCaptureScript, /\/api\/tasks/);
  assert.match(generateCaptureScript, /buildAssistantLegalManualSmokeReportFromCaptures/);
  assert.match(generateCaptureScript, /validateAssistantLegalManualSmokeReport/);

  console.log(JSON.stringify({ status: "legal-manual-smoke-report-pass", cases: 11 }));
}

function buildRetrievalSnapshot(input: {
  taskId: string;
  sourceKind?: string;
  authorityRank?: string;
  sourceUrl?: string;
  locator?: Record<string, unknown>;
  confidenceReason?: string;
  legalEvidence?: boolean;
}): AssistantRetrievedEvidenceSnapshot {
  return {
    taskContext: {
      taskId: input.taskId,
      projectId: "project:manual-smoke",
      title: "Manual smoke task",
      description: "Manual smoke task description",
      status: "new",
      issueId: input.taskId,
      projectName: "Manual smoke project",
    },
    evidence: input.legalEvidence === false ? [] : [{
      id: `verified-legal-search:${input.taskId}`,
      kind: "regulation",
      priority: 2,
      title: input.sourceKind === "molitInterpretation" ? "MOLIT interpretation smoke source" : "Building Act smoke source",
      excerpt: "Answer-ready smoke evidence excerpt",
      sourceUrl: input.sourceUrl,
      recordId: `source:${input.taskId}`,
      legal: {
        sourceId: `source:${input.taskId}`,
        chunkId: `chunk:${input.taskId}`,
        sourceKind: input.sourceKind ?? "statute",
        authorityRank: input.authorityRank ?? "statute",
        effective: { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" },
        locator: input.locator,
        stale: false,
        legalChangeWarnings: [],
        confidenceReason: input.confidenceReason ?? "Answer-ready legal evidence selected by assistant retrieval.",
      },
    }],
    unavailableEvidenceKinds: [],
    evidenceReadinessWarnings: [],
    conversationMemory: "",
  };
}

function restoreEnv(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}

main();
