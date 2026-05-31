import type { AssistantRetrievedEvidenceSnapshot } from "./saas-api-mode";
import type { AssistantEvidence, AssistantLegalEvidenceMetadata } from "./types";

type EnvLike = Record<string, string | undefined>;

export const legalManualSmokeRequiredAnswerFields = [
  "source title",
  "source kind",
  "authority rank",
  "effective date or stale warning",
  "source URL or locator",
  "confidence reason",
] as const;

export type LegalManualSmokeRequiredAnswerField = typeof legalManualSmokeRequiredAnswerFields[number];

export type AssistantLegalManualSmokeCaseDefinition = {
  id: string;
  question: string;
  requiredAnswerFields: LegalManualSmokeRequiredAnswerField[];
};

export const canonicalAssistantLegalManualSmokeCases: AssistantLegalManualSmokeCaseDefinition[] = [
  {
    id: "building-committee-foundation-change",
    question: "\uC0AC\uC5C5\uACC4\uD68D\uC2B9\uC778\uC744 \uBC1B\uC9C0 \uC54A\uC740 \uAE30\uCD08 \uBC0F \uD30C\uC77C \uBCC0\uACBD \uC2DC \uAC74\uCD95\uC704\uC6D0\uD68C \uC2EC\uC758\uB97C \uC0DD\uB7B5\uD560 \uC218 \uC788\uB098\uC694?",
    requiredAnswerFields: legalManualSmokeRequiredAnswerFields.slice(),
  },
  {
    id: "housing-height-relaxed-standard",
    question: "\uB2E4\uAC00\uAD6C\uC8FC\uD0DD\uC758 \uB192\uC774 \uC0B0\uC815\uC5D0 \uC8FC\uD0DD\uAC74\uC124\uAE30\uC900 \uC644\uD654 \uAE30\uC900\uC774 \uC801\uC6A9\uB418\uB098\uC694?",
    requiredAnswerFields: legalManualSmokeRequiredAnswerFields.slice(),
  },
  {
    id: "temporary-building-architect-design",
    question: "\uAC00\uC124\uAC74\uCD95\uBB3C \uCD95\uC870 \uC2E0\uACE0\uD560 \uB54C \uBC18\uB4DC\uC2DC \uAC74\uCD95\uC0AC\uAC00 \uC124\uACC4\uD574\uC57C \uD558\uB098\uC694?",
    requiredAnswerFields: legalManualSmokeRequiredAnswerFields.slice(),
  },
  {
    id: "seoul-site-open-space",
    question: "\uC11C\uC6B8 \uB300\uC9C0\uC548\uC758 \uACF5\uC9C0 \uAE30\uC900\uC740 \uAC74\uCD95\uBC95\uACFC \uC870\uB840 \uC911 \uBB34\uC5C7\uC744 \uBD10\uC57C \uD558\uB098\uC694?",
    requiredAnswerFields: legalManualSmokeRequiredAnswerFields.slice(),
  },
  {
    id: "parking-housing-priority",
    question: "\uC8FC\uCC28\uB300\uC218 \uC0B0\uC815 \uB54C \uC8FC\uD0DD\uBC95\uACFC \uC8FC\uCC28\uC7A5\uBC95 \uC911 \uC5B4\uB5A4 \uADFC\uAC70\uAC00 \uC6B0\uC120\uC778\uAC00\uC694?",
    requiredAnswerFields: legalManualSmokeRequiredAnswerFields.slice(),
  },
];

export type AssistantLegalManualSmokeAnswerField = {
  name: LegalManualSmokeRequiredAnswerField;
  value: string;
  required: true;
};

export type AssistantLegalManualSmokeRetrievalOutcome = "cited" | "explicit_no_source" | "readiness_failed";

export type AssistantLegalManualSmokeCase = {
  id: string;
  question: string;
  requiredAnswerFields: LegalManualSmokeRequiredAnswerField[];
  retrievalOutcome: AssistantLegalManualSmokeRetrievalOutcome;
  answerFields: AssistantLegalManualSmokeAnswerField[];
  capturedAt?: string;
  assistantAnswerExcerpt?: string;
};

export type AssistantLegalManualSmokeReport = {
  status: "ready_for_validation" | "needs_capture";
  captureSource: "assistant-generate-retrieval";
  credentialedSmokeComplete: false;
  generatedAt: string;
  smokeCases: AssistantLegalManualSmokeCase[];
};

export type AssistantLegalManualSmokeValidationReport = {
  status: "passed" | "failed";
  caseCount: number;
  failures: string[];
};

type NormalizedAssistantCapture = {
  id?: string;
  question?: string;
  answer?: string;
  retrieval?: AssistantRetrievedEvidenceSnapshot;
  capturedAt?: string;
};

export function buildAssistantLegalManualSmokeReportFromCaptures(
  captures: unknown,
  options: { generatedAt?: string; env?: EnvLike } = {},
): AssistantLegalManualSmokeReport {
  const env = options.env ?? process.env;
  const normalizedCaptures = normalizeCaptureList(captures);
  const smokeCases = canonicalAssistantLegalManualSmokeCases.map((definition) =>
    buildManualSmokeCase(definition, findCaptureForCase(normalizedCaptures, definition), env),
  );
  return {
    status: smokeCases.every((smokeCase) => smokeCase.retrievalOutcome === "cited" &&
      smokeCase.answerFields.every((field) => field.value.trim())) ? "ready_for_validation" : "needs_capture",
    captureSource: "assistant-generate-retrieval",
    credentialedSmokeComplete: false,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    smokeCases,
  };
}

export function validateAssistantLegalManualSmokeReport(
  report: unknown,
  options: { env?: EnvLike } = {},
): AssistantLegalManualSmokeValidationReport {
  const env = options.env ?? process.env;
  const failures: string[] = [];
  if (!isRecord(report)) {
    return { status: "failed", caseCount: 0, failures: ["manual smoke report must be an object"] };
  }

  if (report.status !== "ready_for_validation" && report.status !== "needs_capture") {
    failures.push("manual smoke report status is invalid");
  }
  if (report.captureSource !== "assistant-generate-retrieval") {
    failures.push("manual smoke report captureSource is invalid");
  }
  if (report.credentialedSmokeComplete !== false) {
    failures.push("manual smoke report credentialedSmokeComplete must remain false");
  }
  if (typeof report.generatedAt !== "string" || !report.generatedAt.trim()) {
    failures.push("manual smoke report generatedAt is required");
  }

  const smokeCases = Array.isArray(report.smokeCases) ? report.smokeCases : [];
  if (!Array.isArray(report.smokeCases)) {
    failures.push("smokeCases must be an array");
  }

  const caseById = new Map<string, Record<string, unknown>>();
  const expectedIds = new Set(canonicalAssistantLegalManualSmokeCases.map((smokeCase) => smokeCase.id));
  for (const smokeCase of smokeCases) {
    if (!isRecord(smokeCase) || typeof smokeCase.id !== "string") {
      failures.push("manual smoke case is missing string id");
      continue;
    }
    if (!expectedIds.has(smokeCase.id)) {
      failures.push(`unexpected manual smoke case: ${smokeCase.id}`);
      continue;
    }
    if (caseById.has(smokeCase.id)) {
      failures.push(`duplicate manual smoke case: ${smokeCase.id}`);
      continue;
    }
    caseById.set(smokeCase.id, smokeCase);
  }

  for (const expectedCase of canonicalAssistantLegalManualSmokeCases) {
    const actualCase = caseById.get(expectedCase.id);
    if (!actualCase) {
      failures.push(`missing manual smoke case: ${expectedCase.id}`);
      continue;
    }
    if (actualCase.question !== expectedCase.question) {
      failures.push(`question mismatch: ${expectedCase.id}`);
    }
    if (actualCase.retrievalOutcome !== "cited") {
      failures.push(`missing assistant legal evidence: ${expectedCase.id}`);
    }
    const fieldByName = readAnswerFields(actualCase, failures, expectedCase.id);
    for (const requiredField of expectedCase.requiredAnswerFields) {
      const answerField = fieldByName.get(requiredField);
      if (!answerField) {
        failures.push(`missing required answer field: ${expectedCase.id}: ${requiredField}`);
        continue;
      }
      if (typeof answerField.value !== "string" || !answerField.value.trim()) {
        failures.push(`blank answer field: ${expectedCase.id}: ${requiredField}`);
        continue;
      }
      if (containsCredentialLikeValue(answerField.value, env)) {
        failures.push(`credential-like value in manual smoke field: ${expectedCase.id}: ${requiredField}`);
      }
    }
  }

  const derivedStatus = deriveReportStatus(caseById);
  if ((report.status === "ready_for_validation" || report.status === "needs_capture") && report.status !== derivedStatus) {
    failures.push("manual smoke report status does not match derived readiness");
  }

  if (containsCredentialLikeValue(JSON.stringify(report), env)) {
    failures.push("credential-like value in manual smoke report");
  }

  return {
    status: failures.length ? "failed" : "passed",
    caseCount: smokeCases.length,
    failures,
  };
}

function deriveReportStatus(caseById: Map<string, Record<string, unknown>>): AssistantLegalManualSmokeReport["status"] {
  for (const expectedCase of canonicalAssistantLegalManualSmokeCases) {
    const actualCase = caseById.get(expectedCase.id);
    if (!actualCase || actualCase.question !== expectedCase.question || actualCase.retrievalOutcome !== "cited") {
      return "needs_capture";
    }
    const fields = readAnswerFields(actualCase, [], expectedCase.id);
    for (const requiredField of expectedCase.requiredAnswerFields) {
      const answerField = fields.get(requiredField);
      if (typeof answerField?.value !== "string" || !answerField.value.trim()) {
        return "needs_capture";
      }
    }
  }
  return "ready_for_validation";
}

function buildManualSmokeCase(
  definition: AssistantLegalManualSmokeCaseDefinition,
  capture: NormalizedAssistantCapture | undefined,
  env: EnvLike,
): AssistantLegalManualSmokeCase {
  const legalEvidence = selectPrimaryLegalEvidence(capture?.retrieval);
  const caseReport: AssistantLegalManualSmokeCase = {
    id: definition.id,
    question: definition.question,
    requiredAnswerFields: definition.requiredAnswerFields,
    retrievalOutcome: legalEvidence ? "cited" : capture?.retrieval ? "readiness_failed" : "explicit_no_source",
    answerFields: buildAnswerFields(legalEvidence, env),
  };
  const capturedAt = normalizeText(capture?.capturedAt);
  if (capturedAt) {
    caseReport.capturedAt = redactCredentialText(capturedAt, env);
  }
  const answerExcerpt = compactText(redactCredentialText(normalizeText(capture?.answer), env), 300);
  if (answerExcerpt) {
    caseReport.assistantAnswerExcerpt = answerExcerpt;
  }
  return caseReport;
}

function buildAnswerFields(
  evidence: AssistantEvidence | undefined,
  env: EnvLike,
): AssistantLegalManualSmokeAnswerField[] {
  const legal = evidence?.legal;
  const values: Record<LegalManualSmokeRequiredAnswerField, string> = {
    "source title": redactCredentialText(normalizeText(evidence?.title), env),
    "source kind": redactCredentialText(normalizeText(legal?.sourceKind), env),
    "authority rank": redactCredentialText(normalizeText(legal?.authorityRank), env),
    "effective date or stale warning": formatEffectiveOrStaleWarning(legal, env),
    "source URL or locator": formatSourceUrlOrLocator(evidence, env),
    "confidence reason": formatConfidenceReason(evidence, env),
  };
  return legalManualSmokeRequiredAnswerFields.map((name) => ({
    name,
    value: values[name],
    required: true,
  }));
}

function selectPrimaryLegalEvidence(retrieval: AssistantRetrievedEvidenceSnapshot | undefined): AssistantEvidence | undefined {
  if (!retrieval) {
    return undefined;
  }
  const candidates = retrieval.evidence.filter((item) => item.kind === "regulation" && item.legal);
  return candidates.find((item) => item.legal?.confidenceReason) ?? candidates[0];
}

function formatEffectiveOrStaleWarning(
  legal: AssistantLegalEvidenceMetadata | undefined,
  env: EnvLike,
): string {
  if (!legal) {
    return "";
  }
  if (legal.stale) {
    return "stale source warning present";
  }
  if (legal.legalChangeWarnings.length > 0) {
    return redactCredentialText(`legal-change warning: ${legal.legalChangeWarnings.join(", ")}`, env);
  }
  if (legal.effective?.effectiveFrom && legal.effective.effectiveTo) {
    return redactCredentialText(`${legal.effective.effectiveFrom} to ${legal.effective.effectiveTo}`, env);
  }
  if (legal.effective?.effectiveFrom) {
    return redactCredentialText(`from ${legal.effective.effectiveFrom}`, env);
  }
  if (legal.effective?.effectiveTo) {
    return redactCredentialText(`until ${legal.effective.effectiveTo}`, env);
  }
  if (legal.effective?.promulgatedAt) {
    return redactCredentialText(`promulgated at ${legal.effective.promulgatedAt}`, env);
  }
  return "";
}

function formatSourceUrlOrLocator(
  evidence: AssistantEvidence | undefined,
  env: EnvLike,
): string {
  const sourceUrl = normalizeOptionalHttpUrl(evidence?.sourceUrl, env);
  if (sourceUrl) {
    return sourceUrl;
  }
  const locator = sanitizeLocatorValue(evidence?.legal?.locator, env);
  if (isRecord(locator) && Object.keys(locator).length > 0) {
    return JSON.stringify(locator);
  }
  return "";
}

function formatConfidenceReason(
  evidence: AssistantEvidence | undefined,
  env: EnvLike,
): string {
  const supplied = redactCredentialText(normalizeText(evidence?.legal?.confidenceReason), env);
  if (supplied) {
    return supplied;
  }
  const legal = evidence?.legal;
  if (!legal) {
    return "";
  }
  return redactCredentialText(
    `Assistant retrieval selected answer-ready ${legal.sourceKind} evidence with authority rank ${legal.authorityRank}.`,
    env,
  );
}

function normalizeCaptureList(value: unknown): NormalizedAssistantCapture[] {
  const items = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.captures)
      ? value.captures
      : isRecord(value) && Array.isArray(value.results)
        ? value.results
        : [];

  return items.map(normalizeCapture).filter((capture): capture is NormalizedAssistantCapture => Boolean(capture));
}

function normalizeCapture(value: unknown): NormalizedAssistantCapture | null {
  if (!isRecord(value)) {
    return null;
  }
  const generated = isRecord(value.generated) ? value.generated : undefined;
  const retrieval = normalizeRetrievalSnapshot(value.retrieval ?? generated?.retrieval);
  const answer = normalizeText(value.answer) || normalizeText(generated?.answer);
  return {
    id: normalizeOptionalText(value.id),
    question: normalizeOptionalText(value.question),
    answer,
    retrieval,
    capturedAt: normalizeOptionalText(value.capturedAt),
  };
}

function normalizeRetrievalSnapshot(value: unknown): AssistantRetrievedEvidenceSnapshot | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const taskContext = isRecord(value.taskContext) ? value.taskContext : undefined;
  const projectId = normalizeText(taskContext?.projectId);
  const taskId = normalizeText(taskContext?.taskId);
  if (!projectId || !taskId || !Array.isArray(value.evidence)) {
    return undefined;
  }
  return {
    taskContext: {
      projectId,
      taskId,
      title: normalizeText(taskContext?.title),
      description: normalizeText(taskContext?.description),
      status: normalizeText(taskContext?.status),
      issueId: normalizeText(taskContext?.issueId),
      projectName: normalizeText(taskContext?.projectName),
    },
    evidence: value.evidence.map(normalizeAssistantEvidence).filter((item): item is AssistantEvidence => Boolean(item)),
    unavailableEvidenceKinds: Array.isArray(value.unavailableEvidenceKinds)
      ? value.unavailableEvidenceKinds.filter((item): item is string => typeof item === "string")
      : [],
    evidenceReadinessWarnings: Array.isArray(value.evidenceReadinessWarnings)
      ? value.evidenceReadinessWarnings
        .map((warning) => isRecord(warning) ? {
          code: normalizeText(warning.code),
          message: normalizeText(warning.message),
        } : null)
        .filter((warning): warning is { code: string; message: string } => Boolean(warning?.code && warning.message))
      : [],
    conversationMemory: normalizeText(value.conversationMemory),
  };
}

function normalizeAssistantEvidence(value: unknown): AssistantEvidence | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = normalizeText(value.id);
  const kind = normalizeText(value.kind);
  const title = normalizeText(value.title);
  const excerpt = normalizeText(value.excerpt);
  if (!id || !isAssistantEvidenceKind(kind) || !title || !excerpt) {
    return null;
  }
  return {
    id,
    kind,
    priority: Number.isFinite(value.priority) ? Number(value.priority) : 99,
    title,
    excerpt,
    sourceUrl: normalizeOptionalText(value.sourceUrl),
    recordId: normalizeOptionalText(value.recordId),
    confidenceWeight: Number.isFinite(value.confidenceWeight) ? Number(value.confidenceWeight) : undefined,
    legal: normalizeLegalEvidenceMetadata(value.legal),
  };
}

function normalizeLegalEvidenceMetadata(value: unknown): AssistantLegalEvidenceMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const sourceId = normalizeText(value.sourceId);
  const sourceKind = normalizeText(value.sourceKind);
  const authorityRank = normalizeText(value.authorityRank);
  if (!sourceId || !sourceKind || !authorityRank) {
    return undefined;
  }
  const effective = isRecord(value.effective) ? {
    effectiveFrom: normalizeOptionalText(value.effective.effectiveFrom),
    effectiveTo: normalizeOptionalText(value.effective.effectiveTo),
    promulgatedAt: normalizeOptionalText(value.effective.promulgatedAt),
  } : undefined;
  return {
    sourceId,
    chunkId: normalizeOptionalText(value.chunkId),
    sourceKind,
    authorityRank,
    ...(effective ? { effective } : {}),
    locator: isRecord(value.locator) ? value.locator : undefined,
    stale: value.stale === true,
    legalChangeWarnings: Array.isArray(value.legalChangeWarnings)
      ? value.legalChangeWarnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0)
      : [],
    confidenceReason: normalizeOptionalText(value.confidenceReason),
  };
}

function findCaptureForCase(
  captures: NormalizedAssistantCapture[],
  definition: AssistantLegalManualSmokeCaseDefinition,
): NormalizedAssistantCapture | undefined {
  return captures.find((capture) => capture.id === definition.id) ??
    captures.find((capture) => capture.question === definition.question);
}

function readAnswerFields(
  actualCase: Record<string, unknown>,
  failures: string[],
  caseId: string,
): Map<string, Record<string, unknown>> {
  if (!Array.isArray(actualCase.answerFields)) {
    failures.push(`answerFields must be an array: ${caseId}`);
    return new Map();
  }
  const fieldByName = new Map<string, Record<string, unknown>>();
  for (const item of actualCase.answerFields) {
    if (!isRecord(item) || typeof item.name !== "string") {
      failures.push(`answer field is missing string name: ${caseId}`);
      continue;
    }
    if (fieldByName.has(item.name)) {
      failures.push(`duplicate answer field: ${caseId}: ${item.name}`);
      continue;
    }
    fieldByName.set(item.name, item);
  }
  return fieldByName;
}

function sanitizeLocatorValue(value: unknown, env: EnvLike): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return normalizeOptionalHttpUrl(trimmed, env) ?? redactCredentialText(trimmed, env);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    const normalized = value.map((item) => sanitizeLocatorValue(item, env)).filter((item) => item !== undefined);
    return normalized.length ? normalized : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const normalized: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key || key.toLowerCase() === "oc" || /oc\s*=/i.test(key) || redactCredentialText(key, env) !== key) {
      continue;
    }
    const sanitizedValue = sanitizeLocatorValue(rawValue, env);
    if (sanitizedValue !== undefined) {
      normalized[key] = sanitizedValue;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeOptionalHttpUrl(value: unknown, env: EnvLike): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase() === "oc") {
        url.searchParams.delete(key);
      }
    }
    const sanitized = url.toString();
    if (/[?&]oc=/i.test(sanitized) || configuredCredentialValues(env).some((credential) => sanitized.includes(credential))) {
      return undefined;
    }
    return sanitized;
  } catch {
    return undefined;
  }
}

function containsCredentialLikeValue(value: string, env: EnvLike): boolean {
  return /(LAW_OPEN_DATA_OC|LEGAL_QUERY_EMBEDDING_API_KEY|ARCHITECT_FILE_EMBEDDING_API_KEY|OPENAI_API_KEY|LEGAL_CHANGE_MONITOR_SECRET|OC\s*=|sk-[A-Za-z0-9])/i
    .test(value) ||
    configuredCredentialValues(env).some((credential) => value.includes(credential));
}

function redactCredentialText(value: string, env: EnvLike): string {
  let redacted = value.replace(/\bOC\s*=\s*[^&\s]+/gi, "[redacted-credential]");
  for (const credential of configuredCredentialValues(env)) {
    redacted = redacted.split(credential).join("[redacted-credential]");
  }
  return redacted.trim();
}

function configuredCredentialValues(env: EnvLike): string[] {
  return [
    env.LAW_OPEN_DATA_OC,
    env.LEGAL_QUERY_EMBEDDING_API_KEY,
    env.ARCHITECT_FILE_EMBEDDING_API_KEY,
    env.OPENAI_API_KEY,
    env.LEGAL_CHANGE_MONITOR_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function normalizeOptionalText(value: unknown): string | undefined {
  return normalizeText(value) || undefined;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 3)}...` : normalized;
}

function isAssistantEvidenceKind(value: string): value is AssistantEvidence["kind"] {
  return value === "central_knowledge" ||
    value === "regulation" ||
    value === "task" ||
    value === "project_document" ||
    value === "web_or_skill";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
