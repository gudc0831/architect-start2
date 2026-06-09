import type { AssistantEvidence, AssistantLegalEvidenceMetadata } from "@/domains/assistant/types";

export type EvidenceReadinessWarning = {
  code: string;
  message: string;
};

export type VerifiedLegalSearchResult = {
  evidence: AssistantEvidence[];
  warnings: EvidenceReadinessWarning[];
};

type FetchImpl = typeof fetch;

type FetchVerifiedLegalSearchEvidenceInput = {
  question: string;
  jurisdiction?: string;
  effectiveDate?: string;
  serviceUrl?: string;
  apiSecret?: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
};

type LegalSearchEffectiveDateRange = {
  effectiveFrom?: string;
  effectiveTo?: string;
  promulgatedAt?: string;
};

type LegalSearchWarningPayload = string | {
  code?: string;
  message: string;
};

type LegalSearchGraphExpansion = {
  maxDepth: 1 | 2;
  mode: string;
  seedNodeIds: string[];
  nodeIds: string[];
  nodeLabels: string[];
  edgeIds: string[];
};

type LegalSearchHit = {
  chunkId: string;
  sourceId: string;
  sourceKind: string;
  authorityRank: string;
  title: string;
  excerpt: string;
  effective: LegalSearchEffectiveDateRange;
  stale: boolean;
  answerReady: boolean;
  sourceUrl?: string;
  locator?: Record<string, unknown>;
  origin?: Record<string, unknown>;
  confidenceReason?: string;
  warnings: string[];
};

type LegalSearchPayload = {
  queryId: string;
  hits: LegalSearchHit[];
  warnings: LegalSearchWarningPayload[];
  graphExpansion?: LegalSearchGraphExpansion;
};

type LegalSearchContextTask = {
  locationRef?: string;
  dueDate?: string;
  issueTitle?: string;
  issueDetailNote?: string;
};

type SelectLegalSearchContextInput = {
  task?: LegalSearchContextTask;
  projectName?: string;
  currentDate?: string;
};

export function selectLegalSearchContext(input: SelectLegalSearchContextInput): { jurisdiction?: string; effectiveDate: string } {
  const jurisdiction = extractJurisdiction([
    input.task?.locationRef,
    input.task?.issueDetailNote,
    input.task?.issueTitle,
    input.projectName,
  ]);
  return {
    ...(jurisdiction ? { jurisdiction } : {}),
    effectiveDate: normalizeDateOnly(input.currentDate ?? new Date().toISOString()),
  };
}

export async function fetchVerifiedLegalSearchEvidence(
  input: FetchVerifiedLegalSearchEvidenceInput,
): Promise<VerifiedLegalSearchResult> {
  const serviceUrl = resolveLegalSearchServiceUrl(input.serviceUrl);
  if (!serviceUrl) {
    return { evidence: [], warnings: [] };
  }
  const apiSecret = resolveLegalEvidenceApiSecret(input.apiSecret);
  if (!apiSecret) {
    return {
      evidence: [],
      warnings: [{
        code: "VERIFIED_LEGAL_EVIDENCE_API_SECRET_MISSING",
        message: "Verified Legal Evidence API is configured, but the SaaS server has no server-to-server API secret.",
      }],
    };
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/api/legal/search", serviceUrl.endsWith("/") ? serviceUrl : `${serviceUrl}/`);
  } catch {
    return {
      evidence: [],
      warnings: [{ code: "VERIFIED_LEGAL_SEARCH_API_URL_INVALID", message: "Verified Legal Evidence API URL is invalid." }],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 5000);
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-verified-legal-evidence-api-secret": apiSecret,
      },
      body: JSON.stringify({
        query: input.question,
        jurisdiction: normalizeOptionalText(input.jurisdiction),
        effectiveDate: normalizeOptionalText(input.effectiveDate),
        limit: 6,
      }),
      signal: controller.signal,
    });
  } catch {
    return {
      evidence: [],
      warnings: [{
        code: "VERIFIED_LEGAL_SEARCH_API_UNREACHABLE",
        message: "Verified Legal Evidence search is unavailable; existing assistant evidence was used.",
      }],
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      evidence: [],
      warnings: [{
        code: "VERIFIED_LEGAL_SEARCH_API_HTTP_ERROR",
        message: `Verified Legal Evidence search returned ${response.status}.`,
      }],
    };
  }

  try {
    return mapLegalSearchPayloadToEvidence(await response.json());
  } catch {
    return invalidLegalSearchResponse();
  }
}

export function mapLegalSearchPayloadToEvidence(payload: unknown): VerifiedLegalSearchResult {
  if (!isLegalSearchPayload(payload)) {
    return invalidLegalSearchResponse();
  }

  const warnings = readLegalSearchWarnings(payload.warnings);
  const hits = payload.hits;
  warnings.push(...readLegalSearchHitWarnings(hits));
  const evidence = hits
    .map(mapLegalSearchHitToEvidence)
    .filter((item): item is AssistantEvidence => Boolean(item));
  if (evidence.length === 0) {
    warnings.push({
      code: "VERIFIED_LEGAL_SEARCH_NO_ANSWER_READY",
      message: "No answer-ready verified legal source was found; the legal basis was not verified.",
    });
  }
  return { evidence, warnings };
}

function invalidLegalSearchResponse(): VerifiedLegalSearchResult {
  return {
    evidence: [],
    warnings: [{ code: "VERIFIED_LEGAL_SEARCH_INVALID", message: "Verified legal search response is invalid." }],
  };
}

function resolveLegalEvidenceApiSecret(inputApiSecret: string | undefined): string {
  return inputApiSecret?.trim() || process.env.VERIFIED_LEGAL_EVIDENCE_API_SECRET?.trim() || "";
}

function mapLegalSearchHitToEvidence(value: unknown, index: number): AssistantEvidence | null {
  if (!isRecord(value) || value.answerReady !== true) {
    return null;
  }

  const sourceKind = normalizeText(value.sourceKind);
  const authorityRank = normalizeText(value.authorityRank);
  const kind = mapLegalSearchKind(sourceKind);
  const excerpt = normalizeText(value.excerpt);
  if (!kind || !excerpt) {
    return null;
  }

  const rawSourceId = normalizeText(value.sourceId);
  if (!rawSourceId) {
    return null;
  }
  const sourceId = redactOfficialLawCredential(rawSourceId);
  const title = formatLegalSearchTitle({
    title: normalizeText(value.title) || "Verified legal search evidence",
    sourceKind,
    authorityRank,
  });
  if (containsOfficialLawCredential([rawSourceId, title, excerpt])) {
    return null;
  }
  const effective = normalizeLegalEffectiveRange(value.effective);
  const sourceUrl = normalizeOptionalHttpUrl(value.sourceUrl);
  const chunkId = normalizeOptionalRedactedText(value.chunkId);
  const locator = normalizeLegalLocator(value.locator) ?? buildFallbackLegalLocator(sourceId, chunkId);
  const legalChangeWarnings = readLegalChangeWarnings(value.warnings);
  const suppliedConfidenceReason = normalizeOptionalText(value.confidenceReason);
  const confidenceReason = suppliedConfidenceReason ? redactOfficialLawCredential(suppliedConfidenceReason) : buildLegalEvidenceConfidenceReason({
    sourceKind,
    authorityRank,
    effective,
    stale: value.stale === true,
    hasSourceLocator: Boolean(sourceUrl || locator),
    legalChangeWarnings,
  });

  return {
    id: `verified-legal-search:${sourceId}:${chunkId || index}`,
    kind,
    priority: kind === "regulation" ? 2 : 4,
    title,
    excerpt,
    sourceUrl,
    recordId: sourceId,
    confidenceWeight: kind === "regulation" ? 0.8 : 0.45,
    legal: {
      sourceId,
      chunkId,
      sourceKind,
      authorityRank,
      effective,
      ...(locator ? { locator } : {}),
      stale: value.stale === true,
      legalChangeWarnings,
      confidenceReason,
    },
  };
}

function mapLegalSearchKind(sourceKind: string): AssistantEvidence["kind"] | null {
  if (
    sourceKind === "statute" ||
    sourceKind === "enforcementDecree" ||
    sourceKind === "enforcementRule" ||
    sourceKind === "administrativeRule" ||
    sourceKind === "localOrdinance" ||
    sourceKind === "constitutionalDecision" ||
    sourceKind === "supremeCourtPrecedent" ||
    sourceKind === "courtPrecedent" ||
    sourceKind === "statutoryInterpretation" ||
    sourceKind === "molitInterpretation" ||
    sourceKind === "administrativeAppeal" ||
    sourceKind === "committeeDecision"
  ) {
    return "regulation";
  }

  return null;
}

function formatLegalSearchTitle(input: { title: string; sourceKind: string; authorityRank: string }): string {
  if (input.sourceKind === "molitInterpretation" || input.authorityRank === "ministry_interpretation") {
    return `MOLIT/ministry interpretation: ${input.title}`;
  }
  if (input.sourceKind === "statutoryInterpretation" || input.authorityRank === "statutory_interpretation") {
    return `Statutory interpretation: ${input.title}`;
  }
  if (input.sourceKind === "supremeCourtPrecedent" || input.sourceKind === "courtPrecedent") {
    return `Court precedent: ${input.title}`;
  }
  if (input.sourceKind === "constitutionalDecision") {
    return `Constitutional decision: ${input.title}`;
  }
  if (input.sourceKind === "administrativeAppeal" || input.sourceKind === "committeeDecision") {
    return `Administrative decision: ${input.title}`;
  }
  return input.title;
}

function readLegalSearchWarnings(value: unknown): EvidenceReadinessWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((warning): EvidenceReadinessWarning | null => {
      if (typeof warning === "string" && warning.trim()) {
        const message = redactOfficialLawCredential(warning.trim());
        return {
          code: normalizeLegalSearchWarningCode(message),
          message,
        };
      }
      if (!isRecord(warning)) {
        return null;
      }
      const code = safeCode(redactOfficialLawCredential(normalizeText(warning.code))) || "VERIFIED_LEGAL_SEARCH_WARNING";
      const message = redactOfficialLawCredential(normalizeText(warning.message));
      return message ? { code, message } : null;
    })
    .filter((warning): warning is EvidenceReadinessWarning => Boolean(warning));
}

function readHitWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0)
    .map((warning) => redactOfficialLawCredential(warning.trim()));
}

function readLegalChangeWarnings(value: unknown): string[] {
  return readHitWarnings(value).filter(isLegalChangeWarning);
}

function isLegalChangeWarning(value: string): boolean {
  return /^LEGAL_CHANGE(?:_|$)/i.test(value);
}

function readLegalSearchHitWarnings(hits: unknown[]): EvidenceReadinessWarning[] {
  const warnings: EvidenceReadinessWarning[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!isRecord(hit)) {
      continue;
    }
    if (hit.answerReady === true) {
      continue;
    }
    const sourceId = redactOfficialLawCredential(normalizeText(hit.sourceId));
    for (const warning of readHitWarnings(hit.warnings)) {
      const code = normalizeLegalSearchWarningCode(warning);
      const key = `${sourceId}:${code}:${warning}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      warnings.push({
        code,
        message: sourceId ? `Legal search hit ${sourceId} warning: ${warning}.` : `Legal search hit warning: ${warning}.`,
      });
    }
  }
  return warnings;
}

function normalizeLegalEffectiveRange(value: unknown): AssistantLegalEvidenceMetadata["effective"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const effectiveFrom = normalizeOptionalText(value.effectiveFrom);
  const effectiveTo = normalizeOptionalText(value.effectiveTo);
  const promulgatedAt = normalizeOptionalText(value.promulgatedAt);
  if (!effectiveFrom && !effectiveTo && !promulgatedAt) {
    return undefined;
  }
  return {
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveTo ? { effectiveTo } : {}),
    ...(promulgatedAt ? { promulgatedAt } : {}),
  };
}

function normalizeLegalLocator(value: unknown): Record<string, unknown> | undefined {
  const normalized = sanitizeLegalLocatorValue(value);
  return isRecord(normalized) && Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildFallbackLegalLocator(sourceId: string, chunkId: string | undefined): Record<string, unknown> {
  return {
    sourceId,
    ...(chunkId ? { chunkId } : {}),
  };
}

function sanitizeLegalLocatorValue(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return normalizeOptionalHttpUrl(trimmed) ?? redactOfficialLawCredential(trimmed);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map(sanitizeLegalLocatorValue)
      .filter((item) => item !== undefined);
    return normalized.length > 0 ? normalized : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key || key.toLowerCase() === "oc") {
      continue;
    }
    if (redactOfficialLawCredential(key) !== key || containsOfficialLawCredential([key])) {
      continue;
    }
    const sanitized = sanitizeLegalLocatorValue(rawValue);
    if (sanitized !== undefined) {
      normalized[key] = sanitized;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildLegalEvidenceConfidenceReason(input: {
  sourceKind: string;
  authorityRank: string;
  effective?: AssistantLegalEvidenceMetadata["effective"];
  stale: boolean;
  hasSourceLocator: boolean;
  legalChangeWarnings: string[];
}): string {
  const parts = [
    `Answer-ready verified ${input.sourceKind} source`,
    `authority rank ${input.authorityRank}`,
  ];
  const effectiveReason = formatLegalEffectiveReason(input.effective);
  if (effectiveReason) {
    parts.push(effectiveReason);
  }
  if (input.hasSourceLocator) {
    parts.push("source locator available");
  } else {
    parts.push("source locator unavailable");
  }
  if (input.stale) {
    parts.push("stale source warning present");
  }
  if (input.legalChangeWarnings.length > 0) {
    parts.push("legal-change review required");
  } else {
    parts.push("no legal-change warning");
  }
  return `${parts.join("; ")}.`;
}

function formatLegalEffectiveReason(effective: AssistantLegalEvidenceMetadata["effective"] | undefined): string {
  if (!effective) {
    return "";
  }
  if (effective.effectiveFrom && effective.effectiveTo) {
    return `effective from ${effective.effectiveFrom} to ${effective.effectiveTo}`;
  }
  if (effective.effectiveFrom) {
    return `effective from ${effective.effectiveFrom}`;
  }
  if (effective.effectiveTo) {
    return `effective until ${effective.effectiveTo}`;
  }
  return effective.promulgatedAt ? `promulgated at ${effective.promulgatedAt}` : "";
}

function isLegalSearchPayload(value: unknown): value is LegalSearchPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!isLegalSearchQueryId(value.queryId)) {
    return false;
  }
  if (!Array.isArray(value.hits) || !value.hits.every(isLegalSearchHit)) {
    return false;
  }
  if (!Array.isArray(value.warnings) || !value.warnings.every(isLegalSearchWarningPayload)) {
    return false;
  }
  if (value.graphExpansion !== undefined && !isLegalSearchGraphExpansion(value.graphExpansion)) {
    return false;
  }
  return true;
}

function isLegalSearchQueryId(value: unknown): value is string {
  return typeof value === "string" && /^legal_query:[a-z0-9:_-]+$/i.test(value.trim());
}

function isLegalSearchHit(value: unknown): value is LegalSearchHit {
  if (!isRecord(value)) {
    return false;
  }
  if (!isNonEmptyString(value.chunkId) || !isNonEmptyString(value.sourceId)) {
    return false;
  }
  if (!isLegalSourceKind(value.sourceKind) || !isLegalSourceAuthorityPair(value.sourceKind, value.authorityRank)) {
    return false;
  }
  if (!isNonEmptyString(value.title) || !isNonEmptyString(value.excerpt)) {
    return false;
  }
  if (!isLegalEffectiveDateRange(value.effective)) {
    return false;
  }
  if (typeof value.stale !== "boolean" || typeof value.answerReady !== "boolean") {
    return false;
  }
  if (!isStringArray(value.warnings)) {
    return false;
  }
  if (value.sourceUrl !== undefined && typeof value.sourceUrl !== "string") {
    return false;
  }
  if (value.locator !== undefined && !isRecord(value.locator)) {
    return false;
  }
  if (value.origin !== undefined && !isRecord(value.origin)) {
    return false;
  }
  if (value.confidenceReason !== undefined && typeof value.confidenceReason !== "string") {
    return false;
  }
  return true;
}

function isLegalSearchWarningPayload(value: unknown): value is LegalSearchWarningPayload {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (!isRecord(value) || !isNonEmptyString(value.message)) {
    return false;
  }
  return value.code === undefined || typeof value.code === "string";
}

function isLegalSearchGraphExpansion(value: unknown): value is LegalSearchGraphExpansion {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.maxDepth === 1 || value.maxDepth === 2) &&
    isNonEmptyString(value.mode) &&
    isStringArray(value.seedNodeIds) &&
    isStringArray(value.nodeIds) &&
    isStringArray(value.nodeLabels) &&
    isStringArray(value.edgeIds)
  );
}

function isLegalEffectiveDateRange(value: unknown): value is LegalSearchEffectiveDateRange {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isOptionalString(value.effectiveFrom) &&
    isOptionalString(value.effectiveTo) &&
    isOptionalString(value.promulgatedAt)
  );
}

function isLegalSourceKind(value: unknown): value is string {
  return typeof value === "string" && legalSearchSourceKinds.has(value);
}

function isLegalSourceAuthorityPair(sourceKind: string, authorityRank: unknown): authorityRank is string {
  return typeof authorityRank === "string" && legalSearchAuthorityRankBySourceKind[sourceKind] === authorityRank;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const legalSearchSourceKinds = new Set<string>([
  "administrativeAppeal",
  "administrativeRule",
  "committeeDecision",
  "constitutionalDecision",
  "courtPrecedent",
  "enforcementDecree",
  "enforcementRule",
  "localOrdinance",
  "molitInterpretation",
  "statute",
  "statutoryInterpretation",
  "supremeCourtPrecedent",
]);

const legalSearchAuthorityRankBySourceKind: Record<string, string> = {
  administrativeAppeal: "administrative_appeal",
  administrativeRule: "administrative_rule_or_notice",
  committeeDecision: "committee_decision",
  constitutionalDecision: "constitutional_decision",
  courtPrecedent: "court_precedent",
  enforcementDecree: "enforcement_decree",
  enforcementRule: "enforcement_rule",
  localOrdinance: "local_ordinance",
  molitInterpretation: "ministry_interpretation",
  statute: "statute",
  statutoryInterpretation: "statutory_interpretation",
  supremeCourtPrecedent: "supreme_court_precedent",
};

function normalizeLegalSearchWarningCode(value: string): string {
  const [code] = value.split(":");
  if (code === "API_ORIGIN_METADATA_INCOMPLETE") {
    return "VERIFIED_LEGAL_SEARCH_API_ORIGIN_METADATA_INCOMPLETE";
  }
  return `VERIFIED_LEGAL_SEARCH_${safeCode(code || "WARNING")}`;
}

function safeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "WARNING";
}

function normalizeOptionalHttpUrl(value: unknown): string | undefined {
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
    if (/[?&]oc=/i.test(sanitized)) {
      return undefined;
    }
    return sanitized;
  } catch {
    return undefined;
  }
}

function containsOfficialLawCredential(values: string[]): boolean {
  return values.some((value) => /(?:^|[?&\s])oc\s*=/i.test(value));
}

function resolveLegalSearchServiceUrl(inputServiceUrl: string | undefined): string {
  const explicitInputUrl = inputServiceUrl?.trim();
  if (explicitInputUrl) {
    return explicitInputUrl;
  }

  const explicitSearchUrl = process.env.VERIFIED_LEGAL_SEARCH_API_URL?.trim();
  if (explicitSearchUrl) {
    return explicitSearchUrl;
  }

  if (process.env.VERIFIED_LEGAL_SEARCH_ENABLED === "1") {
    return process.env.VERIFIED_LEGAL_EVIDENCE_API_URL?.trim() || "";
  }

  return "";
}

function redactOfficialLawCredential(value: string): string {
  return value
    .replace(/\bOC\s*=\s*[^&\s"]+/gi, "[redacted-credential]")
    .replace(/([?&])OC=[^&#\s"]*/gi, "$1OC=[redacted-credential]");
}

function extractJurisdiction(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const text = normalizeText(value);
    if (!text) {
      continue;
    }
    for (const entry of jurisdictionAliases) {
      const alias = entry.aliases.find((candidate) => hasJurisdictionAlias(text, candidate));
      if (alias) {
        return entry.canonical;
      }
    }
  }
  return undefined;
}

const jurisdictionAliases = [
  { canonical: "서울", aliases: ["서울특별시", "서울시", "서울"] },
  { canonical: "부산", aliases: ["부산광역시", "부산시", "부산"] },
  { canonical: "대구", aliases: ["대구광역시", "대구시", "대구"] },
  { canonical: "인천", aliases: ["인천광역시", "인천시", "인천"] },
  { canonical: "광주", aliases: ["광주광역시", "광주시", "광주"] },
  { canonical: "대전", aliases: ["대전광역시", "대전시", "대전"] },
  { canonical: "울산", aliases: ["울산광역시", "울산시", "울산"] },
  { canonical: "세종", aliases: ["세종특별자치시", "세종시", "세종"] },
  { canonical: "경기", aliases: ["경기도", "경기"] },
  { canonical: "강원", aliases: ["강원특별자치도", "강원도", "강원"] },
  { canonical: "충북", aliases: ["충청북도", "충북"] },
  { canonical: "충남", aliases: ["충청남도", "충남"] },
  { canonical: "전북", aliases: ["전북특별자치도", "전라북도", "전북"] },
  { canonical: "전남", aliases: ["전라남도", "전남"] },
  { canonical: "경북", aliases: ["경상북도", "경북"] },
  { canonical: "경남", aliases: ["경상남도", "경남"] },
  { canonical: "제주", aliases: ["제주특별자치도", "제주도", "제주"] },
];

function hasJurisdictionAlias(text: string, alias: string): boolean {
  let index = text.indexOf(alias);
  while (index >= 0) {
    const next = text[index + alias.length] ?? "";
    if (alias.length > 2 || !next || !/\p{Letter}/u.test(next) || next === "시" || next === "도") {
      return true;
    }
    index = text.indexOf(alias, index + alias.length);
  }
  return false;
}

function normalizeDateOnly(value: string): string {
  const trimmed = value.trim();
  const zonedDateTime = parseZonedDateTime(trimmed);
  if (zonedDateTime) {
    if (!isValidCalendarDate(zonedDateTime.year, zonedDateTime.month, zonedDateTime.day)) {
      return "";
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatKoreanLegalDate(parsed);
    }
    return "";
  }

  const localDateTime = parseLocalDateTime(trimmed);
  if (localDateTime) {
    return isValidCalendarDate(localDateTime.year, localDateTime.month, localDateTime.day)
      ? `${localDateTime.year}-${localDateTime.month}-${localDateTime.day}`
      : "";
  }
  if (looksLikeDateTime(trimmed)) {
    return "";
  }

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (compact) {
    return isValidCalendarDate(compact[1], compact[2], compact[3])
      ? `${compact[1]}-${compact[2]}-${compact[3]}`
      : "";
  }
  const separated = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(trimmed);
  if (separated) {
    const month = separated[2].padStart(2, "0");
    const day = separated[3].padStart(2, "0");
    return isValidCalendarDate(separated[1], month, day)
      ? [separated[1], month, day].join("-")
      : "";
  }
  return trimmed.slice(0, 10);
}

function parseZonedDateTime(value: string): { year: string; month: string; day: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
}

function parseLocalDateTime(value: string): { year: string; month: string; day: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.exec(value);
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
}

function looksLikeDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isValidCalendarDate(year: string, month: string, day: string): boolean {
  const yearValue = Number(year);
  const monthValue = Number(month);
  const dayValue = Number(day);
  if (!Number.isInteger(yearValue) || !Number.isInteger(monthValue) || !Number.isInteger(dayValue)) {
    return false;
  }
  if (monthValue < 1 || monthValue > 12 || dayValue < 1) {
    return false;
  }
  return dayValue <= new Date(Date.UTC(yearValue, monthValue, 0)).getUTCDate();
}

function formatKoreanLegalDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));
  return [
    partByType.get("year") ?? "",
    partByType.get("month") ?? "",
    partByType.get("day") ?? "",
  ].join("-");
}

function normalizeOptionalText(value: unknown): string | undefined {
  return normalizeText(value) || undefined;
}

function normalizeOptionalRedactedText(value: unknown): string | undefined {
  const redacted = redactOfficialLawCredential(normalizeText(value)).trim();
  return redacted || undefined;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
