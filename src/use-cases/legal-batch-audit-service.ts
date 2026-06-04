type FetchImpl = typeof fetch;

type FetchLegalBatchAuditStatusInput = {
  reportPath?: string;
  serviceUrl?: string;
  secret?: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
};

type LegalBatchAuditWarning = {
  code: string;
  message: string;
};

type LegalBatchAuditCounts = {
  seedCount: number;
  supportedSeedCount: number;
  requestedLimit: number;
  attemptedCount: number;
  syncedCount: number;
  failedCount: number;
  skippedSupportedCount: number;
  unsupportedCount: number;
};

type LegalBatchAuditSyncedSeed = {
  seed: string;
  kind: string;
  sourceCount: number;
  chunkCount: number;
};

type LegalBatchAuditFailedSeed = {
  seed: string;
  kind: string;
  message: string;
};

type LegalBatchAuditSkippedSeeds = {
  unsupported: string[];
  limitSkipped: string[];
  stopSkipped: string[];
};

export type LegalBatchAuditOperatorStatus = {
  status: "operator_audit";
  batchStatus: "synced_batch" | "partial_batch" | "failed_batch";
  refreshStatus: "refresh_allowed" | "refresh_blocked";
  readyForRefresh: boolean;
  nextAction: "execute_refresh" | "fix_failed_seeds";
  counts: LegalBatchAuditCounts;
  syncedSeeds: LegalBatchAuditSyncedSeed[];
  failedSeeds: LegalBatchAuditFailedSeed[];
  skippedSeeds: LegalBatchAuditSkippedSeeds;
  refreshCommands: string[];
  warnings: string[];
};

export type LegalBatchAuditUnavailableStatus = {
  status: "legal_batch_audit_unavailable";
  refreshStatus: "unavailable";
  readyForRefresh: false;
  nextAction: "check_verified_legal_service";
  counts: LegalBatchAuditCounts;
  syncedSeeds: [];
  failedSeeds: [];
  skippedSeeds: LegalBatchAuditSkippedSeeds;
  refreshCommands: [];
  warnings: LegalBatchAuditWarning[];
};

export type LegalBatchAuditStatus = LegalBatchAuditOperatorStatus | LegalBatchAuditUnavailableStatus;

const emptyCounts: LegalBatchAuditCounts = {
  seedCount: 0,
  supportedSeedCount: 0,
  requestedLimit: 0,
  attemptedCount: 0,
  syncedCount: 0,
  failedCount: 0,
  skippedSupportedCount: 0,
  unsupportedCount: 0,
};

assertServerOnlyRuntime();

export async function fetchLegalBatchAuditStatus(
  input: FetchLegalBatchAuditStatusInput = {},
): Promise<LegalBatchAuditStatus> {
  const serviceUrl = resolveVerifiedLegalEvidenceServiceUrl(input.serviceUrl);
  if (!serviceUrl) {
    return unavailableLegalBatchAuditStatus("VERIFIED_LEGAL_BATCH_AUDIT_API_URL_MISSING", "Verified Legal Evidence API URL is not configured.");
  }

  const reportPath = normalizeReportPath(input.reportPath ?? process.env.LEGAL_BATCH_AUDIT_REPORT_PATH);
  if (!reportPath) {
    return unavailableLegalBatchAuditStatus("VERIFIED_LEGAL_BATCH_AUDIT_REPORT_PATH_MISSING", "Legal batch audit report path is not configured.");
  }
  if (!isSafeRelativeReportPath(reportPath)) {
    return unavailableLegalBatchAuditStatus("VERIFIED_LEGAL_BATCH_AUDIT_REPORT_PATH_UNSAFE", "Legal batch audit report path is unsafe.");
  }

  const secret = normalizeText(input.secret ?? process.env.LEGAL_CHANGE_MONITOR_SECRET);
  if (!secret) {
    return unavailableLegalBatchAuditStatus("VERIFIED_LEGAL_BATCH_AUDIT_SECRET_MISSING", "Legal batch audit server secret is not configured.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/api/legal/batch-refresh/audit-summary", serviceUrl.endsWith("/") ? serviceUrl : `${serviceUrl}/`);
  } catch {
    return unavailableLegalBatchAuditStatus("VERIFIED_LEGAL_BATCH_AUDIT_API_URL_INVALID", "Verified Legal Evidence API URL is invalid.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 5000);
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-legal-change-monitor-secret": secret,
      },
      body: JSON.stringify({ reportPath }),
      signal: controller.signal,
    });
  } catch {
    return unavailableLegalBatchAuditStatus(
      "VERIFIED_LEGAL_BATCH_AUDIT_API_UNREACHABLE",
      "Verified Legal Evidence batch audit is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return mapUpstreamAuditError(response.status, payload);
  }

  return mapLegalBatchAuditPayloadToStatus(payload);
}

export function mapLegalBatchAuditPayloadToStatus(payload: unknown): LegalBatchAuditStatus {
  if (!isLegalBatchAuditOperatorPayload(payload)) {
    return unavailableLegalBatchAuditStatus("VERIFIED_LEGAL_BATCH_AUDIT_INVALID", "Verified Legal Evidence batch audit response is invalid.");
  }

  return {
    status: "operator_audit",
    batchStatus: payload.batchStatus,
    refreshStatus: payload.refreshStatus,
    readyForRefresh: payload.readyForRefresh,
    nextAction: payload.nextAction,
    counts: { ...payload.counts },
    syncedSeeds: payload.syncedSeeds.map((seed) => ({ ...seed })),
    failedSeeds: payload.failedSeeds.map((seed) => ({
      seed: seed.seed,
      kind: seed.kind,
      message: redactLegalBatchAuditText(seed.message),
    })),
    skippedSeeds: {
      unsupported: payload.skippedSeeds.unsupported.map(redactLegalBatchAuditText),
      limitSkipped: payload.skippedSeeds.limitSkipped.map(redactLegalBatchAuditText),
      stopSkipped: payload.skippedSeeds.stopSkipped.map(redactLegalBatchAuditText),
    },
    refreshCommands: payload.refreshCommands.map(redactLegalBatchAuditText),
    warnings: payload.warnings.map(redactLegalBatchAuditText),
  };
}

function mapUpstreamAuditError(status: number, payload: unknown): LegalBatchAuditUnavailableStatus {
  if (status === 403) {
    return unavailableLegalBatchAuditStatus(
      "VERIFIED_LEGAL_BATCH_AUDIT_FORBIDDEN",
      "Verified Legal Evidence rejected the server audit secret.",
      payload,
    );
  }
  if (status === 409) {
    return unavailableLegalBatchAuditStatus(
      "VERIFIED_LEGAL_BATCH_AUDIT_REPORT_UNAVAILABLE",
      "Verified Legal Evidence could not read the requested batch audit report.",
      payload,
    );
  }
  return unavailableLegalBatchAuditStatus(
    "VERIFIED_LEGAL_BATCH_AUDIT_API_HTTP_ERROR",
    `Verified Legal Evidence batch audit returned ${status}.`,
    payload,
  );
}

function unavailableLegalBatchAuditStatus(
  code: string,
  message: string,
  payload?: unknown,
): LegalBatchAuditUnavailableStatus {
  return {
    status: "legal_batch_audit_unavailable",
    refreshStatus: "unavailable",
    readyForRefresh: false,
    nextAction: "check_verified_legal_service",
    counts: { ...emptyCounts },
    syncedSeeds: [],
    failedSeeds: [],
    skippedSeeds: {
      unsupported: [],
      limitSkipped: [],
      stopSkipped: [],
    },
    refreshCommands: [],
    warnings: [{
      code,
      message: redactLegalBatchAuditText(readUpstreamErrorMessage(payload) || message),
    }],
  };
}

function readUpstreamErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) {
    return "";
  }
  return [
    normalizeText(payload.errorCode),
    normalizeText(payload.error),
    normalizeText(payload.message),
    normalizeText(payload.remediation),
  ].filter(Boolean).join(": ");
}

function isLegalBatchAuditOperatorPayload(value: unknown): value is LegalBatchAuditOperatorStatus {
  if (!isRecord(value)) {
    return false;
  }
  if (value.status !== "operator_audit") {
    return false;
  }
  if (!isOptionalSafeReportPath(value.reportPath)) {
    return false;
  }
  if (!["synced_batch", "partial_batch", "failed_batch"].includes(normalizeText(value.batchStatus))) {
    return false;
  }
  if (!["refresh_allowed", "refresh_blocked"].includes(normalizeText(value.refreshStatus))) {
    return false;
  }
  if (typeof value.readyForRefresh !== "boolean") {
    return false;
  }
  if (!["execute_refresh", "fix_failed_seeds"].includes(normalizeText(value.nextAction))) {
    return false;
  }
  if (!isLegalBatchAuditCounts(value.counts)) {
    return false;
  }
  if (!Array.isArray(value.syncedSeeds) || !value.syncedSeeds.every(isSyncedSeed)) {
    return false;
  }
  if (!Array.isArray(value.failedSeeds) || !value.failedSeeds.every(isFailedSeed)) {
    return false;
  }
  if (!isSkippedSeeds(value.skippedSeeds)) {
    return false;
  }
  return Array.isArray(value.refreshCommands) &&
    value.refreshCommands.every(isString) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isString);
}

function isLegalBatchAuditCounts(value: unknown): value is LegalBatchAuditCounts {
  if (!isRecord(value)) {
    return false;
  }
  return [
    "seedCount",
    "supportedSeedCount",
    "requestedLimit",
    "attemptedCount",
    "syncedCount",
    "failedCount",
    "skippedSupportedCount",
    "unsupportedCount",
  ].every((key) => isNonNegativeInteger(value[key]));
}

function isSyncedSeed(value: unknown): value is LegalBatchAuditSyncedSeed {
  return isRecord(value) &&
    isNonEmptyString(value.seed) &&
    isNonEmptyString(value.kind) &&
    isNonNegativeInteger(value.sourceCount) &&
    isNonNegativeInteger(value.chunkCount);
}

function isFailedSeed(value: unknown): value is LegalBatchAuditFailedSeed {
  return isRecord(value) &&
    isNonEmptyString(value.seed) &&
    isNonEmptyString(value.kind) &&
    isNonEmptyString(value.message);
}

function isSkippedSeeds(value: unknown): value is LegalBatchAuditSkippedSeeds {
  return isRecord(value) &&
    isStringArray(value.unsupported) &&
    isStringArray(value.limitSkipped) &&
    isStringArray(value.stopSkipped);
}

function isOptionalSafeReportPath(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && isSafeRelativeReportPath(value));
}

function assertServerOnlyRuntime(): void {
  if (typeof window !== "undefined") {
    throw new Error("legal-batch-audit-service must only run on the server.");
  }
}

function isSafeRelativeReportPath(value: string): boolean {
  const reportPath = value.trim();
  return Boolean(reportPath) &&
    /\.json$/i.test(reportPath) &&
    !/^(?:[a-zA-Z]:|[\\/])/.test(reportPath) &&
    !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(reportPath) &&
    !/(?:oc=|api[_-]?key|secret|token|credential|law[_-]?open[_-]?data)/i.test(reportPath);
}

function resolveVerifiedLegalEvidenceServiceUrl(inputServiceUrl: string | undefined): string {
  return normalizeText(inputServiceUrl) || normalizeText(process.env.VERIFIED_LEGAL_EVIDENCE_API_URL);
}

function redactLegalBatchAuditText(value: string): string {
  const secrets = [
    process.env.LEGAL_CHANGE_MONITOR_SECRET,
    process.env.LAW_OPEN_DATA_OC,
  ].map(normalizeText).filter(Boolean);
  let redacted = value
    .replace(/\bOC\s*=\s*[^&\s"]+/gi, "[redacted-credential]")
    .replace(/\bx-legal-change-monitor-secret\b/gi, "[redacted-header]")
    .replace(/\bLEGAL_CHANGE_MONITOR_SECRET\b/g, "[redacted-env]")
    .replace(/[a-zA-Z]:\\[^\s"]+/g, "[redacted-path]")
    .replace(/\/(?:tmp|var|Users|home)\/[^\s"]+/g, "[redacted-path]");
  for (const secret of secrets) {
    redacted = redacted.split(secret).join("[redacted-credential]");
  }
  return redacted;
}

function normalizeReportPath(value: unknown): string {
  return normalizeText(value).replace(/\\/g, "/");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
