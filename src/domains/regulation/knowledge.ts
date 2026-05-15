import type { AssistantEvidence } from "@/domains/assistant/types";

export type RegulationSourceKind =
  | "law"
  | "enforcement_decree"
  | "enforcement_rule"
  | "administrative_rule"
  | "local_ordinance"
  | "official_guidance";

export type RegulationReviewStatus = "admin_review_required" | "approved";
export type RegulationFreshnessStatus = "seed_unverified" | "current_at_collection" | "stale";

export type RegulationImportContract = {
  mode: "admin_seed_package";
  networkPolicy: "offline_only";
  requiredReview: "knowledge_admin";
  contentPolicy: string[];
};

export type RegulationOfficialSource = {
  id: string;
  kind: RegulationSourceKind;
  name: string;
  publisher: string;
  jurisdiction: string;
  officialUrl: string;
  priority: number;
};

export type RegulationSeedDocument = {
  id: string;
  sourceId: string;
  title: string;
  sourceLocator: string;
  versionLabel: string;
  effectiveDate: string;
  collectedAt: string;
  reviewStatus: RegulationReviewStatus;
  freshnessStatus: RegulationFreshnessStatus;
  retrievalPriority: number;
  tags: string[];
  aliases: string[];
  summary: string;
  bodyMarkdown: string;
};

export type RegulationSeedPackage = {
  schemaVersion: "architect.regulation.seed.v1";
  packageId: string;
  title: string;
  jurisdiction: string;
  language: "ko";
  generatedAt: string;
  importContract: RegulationImportContract;
  sources: RegulationOfficialSource[];
  documents: RegulationSeedDocument[];
};

export type RegulationSearchResult = {
  packageId: string;
  document: RegulationSeedDocument;
  source: RegulationOfficialSource | null;
  score: number;
  matchedTerms: string[];
};

export type RegulationSeedValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sourceCount: number;
  documentCount: number;
};

export type RegulationEvaluationQuery = {
  id: string;
  question: string;
  expectedEvidenceKind: "regulation";
  expectedDocumentIds: string[];
  requiredTerms: string[];
};

export type RegulationEvaluationFixture = {
  schemaVersion: "architect.regulation.eval.v1";
  fixtureId: string;
  seedPackageId: string;
  queries: RegulationEvaluationQuery[];
};

export type RegulationEvaluationQueryResult = {
  id: string;
  question: string;
  expectedDocumentIds: string[];
  resultDocumentIds: string[];
  topDocumentId: string | null;
  passed: boolean;
};

export type RegulationEvaluationReport = {
  passed: boolean;
  queryCount: number;
  passedCount: number;
  failures: RegulationEvaluationQueryResult[];
  queryResults: RegulationEvaluationQueryResult[];
};

const sourceKinds: RegulationSourceKind[] = [
  "law",
  "enforcement_decree",
  "enforcement_rule",
  "administrative_rule",
  "local_ordinance",
  "official_guidance",
];

const reviewStatuses: RegulationReviewStatus[] = ["admin_review_required", "approved"];
const freshnessStatuses: RegulationFreshnessStatus[] = ["seed_unverified", "current_at_collection", "stale"];

export function validateRegulationSeedPackage(value: unknown): RegulationSeedValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: ["Seed package must be a JSON object."],
      warnings,
      sourceCount: 0,
      documentCount: 0,
    };
  }

  if (readString(value.schemaVersion) !== "architect.regulation.seed.v1") {
    errors.push("schemaVersion must be architect.regulation.seed.v1.");
  }
  if (!readString(value.packageId)) {
    errors.push("packageId is required.");
  }
  if (readString(value.language) !== "ko") {
    errors.push("language must be ko for the initial Korean regulation seed.");
  }
  validateImportContract(value.importContract, errors);

  const sourceValues = Array.isArray(value.sources) ? value.sources : [];
  const documentValues = Array.isArray(value.documents) ? value.documents : [];
  if (!sourceValues.length) {
    errors.push("At least one official source is required.");
  }
  if (!documentValues.length) {
    errors.push("At least one regulation document is required.");
  }

  const sourceIds = new Set<string>();
  for (const [index, source] of sourceValues.entries()) {
    const sourceId = validateSource(source, index, errors);
    if (!sourceId) {
      continue;
    }
    if (sourceIds.has(sourceId)) {
      errors.push(`sources[${index}].id must be unique: ${sourceId}.`);
      continue;
    }
    sourceIds.add(sourceId);
  }

  const documentIds = new Set<string>();
  for (const [index, document] of documentValues.entries()) {
    const documentId = validateDocument(document, index, sourceIds, errors, warnings);
    if (!documentId) {
      continue;
    }
    if (documentIds.has(documentId)) {
      errors.push(`documents[${index}].id must be unique: ${documentId}.`);
      continue;
    }
    documentIds.add(documentId);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sourceCount: sourceValues.length,
    documentCount: documentValues.length,
  };
}

export function validateRegulationEvaluationFixture(value: unknown): RegulationSeedValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: ["Evaluation fixture must be a JSON object."],
      warnings,
      sourceCount: 0,
      documentCount: 0,
    };
  }

  if (readString(value.schemaVersion) !== "architect.regulation.eval.v1") {
    errors.push("schemaVersion must be architect.regulation.eval.v1.");
  }
  if (!readString(value.fixtureId)) {
    errors.push("fixtureId is required.");
  }
  if (!readString(value.seedPackageId)) {
    errors.push("seedPackageId is required.");
  }

  const queries = Array.isArray(value.queries) ? value.queries : [];
  if (queries.length < 5 || queries.length > 10) {
    errors.push("Evaluation fixture must contain 5 to 10 fixed queries.");
  }

  for (const [index, query] of queries.entries()) {
    if (!isRecord(query)) {
      errors.push(`queries[${index}] must be an object.`);
      continue;
    }
    if (!readString(query.id)) {
      errors.push(`queries[${index}].id is required.`);
    }
    if (!readString(query.question)) {
      errors.push(`queries[${index}].question is required.`);
    }
    if (readString(query.expectedEvidenceKind) !== "regulation") {
      errors.push(`queries[${index}].expectedEvidenceKind must be regulation.`);
    }
    if (!readStringArray(query.expectedDocumentIds).length) {
      errors.push(`queries[${index}].expectedDocumentIds must include at least one document id.`);
    }
    if (!readStringArray(query.requiredTerms).length) {
      warnings.push(`queries[${index}].requiredTerms is empty.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sourceCount: 0,
    documentCount: queries.length,
  };
}

export function searchRegulationSeedPackage(seedPackage: RegulationSeedPackage, query: string, limit = 4): RegulationSearchResult[] {
  const terms = tokenizeSearchText(query);
  if (!terms.length) {
    return [];
  }

  const sourcesById = new Map(seedPackage.sources.map((source) => [source.id, source]));
  return seedPackage.documents
    .map((document) => {
      const source = sourcesById.get(document.sourceId) ?? null;
      const match = scoreRegulationDocument(document, source, terms);
      return {
        packageId: seedPackage.packageId,
        document,
        source,
        score: match.score,
        matchedTerms: match.matchedTerms,
      } satisfies RegulationSearchResult;
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      const priorityDelta = left.document.retrievalPriority - right.document.retrievalPriority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.document.id.localeCompare(right.document.id);
    })
    .slice(0, Math.max(0, limit));
}

export function regulationSearchResultToEvidence(result: RegulationSearchResult): AssistantEvidence {
  const document = result.document;
  const source = result.source;
  const reviewNotice =
    document.reviewStatus === "approved"
      ? "관리자 승인된 법규 seed 근거입니다."
      : "관리자 검토 전 foundation seed 근거입니다. 공식 원문, 시행일, 별표 내용은 import 전에 재확인해야 합니다.";
  const sourceLabel = [source?.name, document.sourceLocator, document.versionLabel].filter(Boolean).join(" / ");

  return {
    id: `regulation-seed:${document.id}`,
    kind: "regulation",
    priority: 2,
    title: document.title,
    excerpt: compactExcerpt([sourceLabel, reviewNotice, document.summary, document.bodyMarkdown]),
    sourceUrl: source?.officialUrl,
    recordId: document.id,
    confidenceWeight: document.reviewStatus === "approved" ? 0.74 : 0.46,
  };
}

export function evaluateRegulationSearchFixture(
  seedPackage: RegulationSeedPackage,
  fixture: RegulationEvaluationFixture,
): RegulationEvaluationReport {
  const queryResults = fixture.queries.map((query) => {
    const results = searchRegulationSeedPackage(seedPackage, query.question, 4);
    const resultDocumentIds = results.map((result) => result.document.id);
    const matchedExpectedDocument = query.expectedDocumentIds.some((documentId) => resultDocumentIds.includes(documentId));
    const passed = query.expectedEvidenceKind === "regulation" && matchedExpectedDocument;

    return {
      id: query.id,
      question: query.question,
      expectedDocumentIds: query.expectedDocumentIds,
      resultDocumentIds,
      topDocumentId: resultDocumentIds[0] ?? null,
      passed,
    } satisfies RegulationEvaluationQueryResult;
  });
  const failures = queryResults.filter((result) => !result.passed);

  return {
    passed: failures.length === 0,
    queryCount: queryResults.length,
    passedCount: queryResults.length - failures.length,
    failures,
    queryResults,
  };
}

function validateImportContract(value: unknown, errors: string[]) {
  if (!isRecord(value)) {
    errors.push("importContract is required.");
    return;
  }
  if (readString(value.mode) !== "admin_seed_package") {
    errors.push("importContract.mode must be admin_seed_package.");
  }
  if (readString(value.networkPolicy) !== "offline_only") {
    errors.push("importContract.networkPolicy must be offline_only.");
  }
  if (readString(value.requiredReview) !== "knowledge_admin") {
    errors.push("importContract.requiredReview must be knowledge_admin.");
  }
  if (!readStringArray(value.contentPolicy).length) {
    errors.push("importContract.contentPolicy must describe review and source policies.");
  }
}

function validateSource(value: unknown, index: number, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`sources[${index}] must be an object.`);
    return null;
  }

  const id = readString(value.id);
  const kind = readString(value.kind);
  const officialUrl = readString(value.officialUrl);
  if (!id) {
    errors.push(`sources[${index}].id is required.`);
  }
  if (!sourceKinds.includes(kind as RegulationSourceKind)) {
    errors.push(`sources[${index}].kind is invalid.`);
  }
  if (!readString(value.name)) {
    errors.push(`sources[${index}].name is required.`);
  }
  if (!readString(value.publisher)) {
    errors.push(`sources[${index}].publisher is required.`);
  }
  if (!isHttpUrl(officialUrl)) {
    errors.push(`sources[${index}].officialUrl must be an http(s) URL.`);
  }
  if (!Number.isFinite(Number(value.priority))) {
    errors.push(`sources[${index}].priority must be numeric.`);
  }

  return id || null;
}

function validateDocument(
  value: unknown,
  index: number,
  sourceIds: Set<string>,
  errors: string[],
  warnings: string[],
) {
  if (!isRecord(value)) {
    errors.push(`documents[${index}] must be an object.`);
    return null;
  }

  const id = readString(value.id);
  const sourceId = readString(value.sourceId);
  if (!id) {
    errors.push(`documents[${index}].id is required.`);
  }
  if (!sourceId || !sourceIds.has(sourceId)) {
    errors.push(`documents[${index}].sourceId must reference a known source.`);
  }
  for (const key of ["title", "sourceLocator", "versionLabel", "effectiveDate", "collectedAt", "summary", "bodyMarkdown"]) {
    if (!readString(value[key])) {
      errors.push(`documents[${index}].${key} is required.`);
    }
  }
  if (!reviewStatuses.includes(readString(value.reviewStatus) as RegulationReviewStatus)) {
    errors.push(`documents[${index}].reviewStatus is invalid.`);
  }
  if (!freshnessStatuses.includes(readString(value.freshnessStatus) as RegulationFreshnessStatus)) {
    errors.push(`documents[${index}].freshnessStatus is invalid.`);
  }
  if (!Number.isFinite(Number(value.retrievalPriority))) {
    errors.push(`documents[${index}].retrievalPriority must be numeric.`);
  }
  if (!readStringArray(value.tags).length) {
    errors.push(`documents[${index}].tags must include at least one tag.`);
  }
  if (!readStringArray(value.aliases).length) {
    warnings.push(`documents[${index}].aliases is empty.`);
  }
  if (!readString(value.bodyMarkdown).includes("##")) {
    warnings.push(`documents[${index}].bodyMarkdown should use Markdown headings.`);
  }

  return id || null;
}

function scoreRegulationDocument(document: RegulationSeedDocument, source: RegulationOfficialSource | null, terms: string[]) {
  const matches = new Set<string>();
  let score = 0;

  score += scoreTerms(document.title, terms, 6, matches);
  score += scoreTerms(document.sourceLocator, terms, 5, matches);
  score += scoreTerms(document.aliases.join(" "), terms, 4, matches);
  score += scoreTerms(document.tags.join(" "), terms, 3, matches);
  score += scoreTerms(document.summary, terms, 2, matches);
  score += scoreTerms(document.bodyMarkdown, terms, 1, matches);
  score += scoreTerms(source ? `${source.name} ${source.publisher} ${source.kind}` : "", terms, 1, matches);

  if (document.reviewStatus === "approved") {
    score += 1;
  }

  return { score, matchedTerms: [...matches] };
}

function scoreTerms(value: string, terms: string[], weight: number, matches: Set<string>) {
  const haystack = value.toLowerCase();
  return terms.reduce((score, term) => {
    if (!haystack.includes(term)) {
      return score;
    }
    matches.add(term);
    return score + weight;
  }, 0);
}

function tokenizeSearchText(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}\s-]/gu, " ")
        .split(/\s+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  ];
}

function compactExcerpt(parts: Array<string | undefined>, limit = 700) {
  const compacted = parts
    .map((part) => part?.replace(/\s+/gu, " ").trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

  if (compacted.length <= limit) {
    return compacted;
  }

  return `${compacted.slice(0, limit - 1).trimEnd()}…`;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
