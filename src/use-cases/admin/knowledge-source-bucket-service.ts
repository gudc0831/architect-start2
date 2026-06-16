import { createHash } from "node:crypto";
import type { ApprovedKnowledgeItem, AssistantEvidence, AssistantRecord } from "@/domains/assistant/types";
import {
  knowledgeSourceKinds,
  type KnowledgeAllowedUse,
  type KnowledgeSourceKind,
  type KnowledgeSourceRef,
} from "@/domains/knowledge/structured-knowledge";
import { notFound } from "@/lib/api/errors";
import { assistantRepository } from "@/repositories/assistant";
import { sanitizeKnowledgeResponse } from "@/use-cases/admin/knowledge-response-sanitizer";

export type KnowledgeSourceBucket = {
  kind: KnowledgeSourceKind;
  label: string;
  required: boolean;
  items: KnowledgeSourceRef[];
  warnings: string[];
};

const bucketLabels = {
  legal_evidence: "법규 근거",
  task_context: "작업 맥락",
  project_document: "프로젝트 문서",
  approved_wiki: "승인된 WIKI",
  local_wiki: "로컬 WIKI",
  external_evidence: "외부 근거",
} satisfies Record<KnowledgeSourceKind, string>;

const bucketRequired = {
  legal_evidence: false,
  task_context: true,
  project_document: false,
  approved_wiki: false,
  local_wiki: false,
  external_evidence: false,
} satisfies Record<KnowledgeSourceKind, boolean>;

export async function getKnowledgeSourceBuckets(input: {
  recordId: string;
  projectId: string;
}): Promise<KnowledgeSourceBucket[]> {
  const recordId = normalizeRequiredText(input.recordId);
  const projectId = normalizeRequiredText(input.projectId);
  const record = await assistantRepository.findRecordById(recordId);

  if (!record || record.candidateState === "not_candidate" || record.projectId !== projectId) {
    throw notFound("Knowledge candidate not found", "KNOWLEDGE_CANDIDATE_NOT_FOUND");
  }

  const approvedKnowledge = await assistantRepository.searchApprovedKnowledge({
    projectId,
    query: buildApprovedKnowledgeQuery(record),
    limit: 6,
  });
  const buckets = createEmptyBuckets();

  addItems(
    buckets,
    "legal_evidence",
    record.evidence.filter(isLegalEvidence).map(toLegalEvidenceSourceRef),
  );
  if (buckets.legal_evidence.items.some((item) => !item.verifiedAt)) {
    addWarning(buckets.legal_evidence, "법규 근거 확인 시점 누락");
  }

  addItems(buckets, "task_context", [toTaskContextSourceRef(record)]);
  addItems(
    buckets,
    "project_document",
    record.evidence.filter((evidence) => evidence.kind === "project_document").map(toProjectDocumentSourceRef),
  );
  addItems(
    buckets,
    "approved_wiki",
    approvedKnowledge
      .filter((item) => item.sourceRecordId !== record.id)
      .map(toApprovedWikiSourceRef),
  );

  const localWikiSource = record.metadata.knowledgeCandidateSource?.type === "local_wiki_import"
    ? record.metadata.knowledgeCandidateSource
    : null;
  if (localWikiSource) {
    addItems(buckets, "local_wiki", [toLocalWikiSourceRef(record, localWikiSource)]);
    if (!normalizeOptionalText(localWikiSource.sourceDigest)) {
      addWarning(buckets.local_wiki, "로컬 WIKI digest 누락");
    }
  }

  addItems(buckets, "external_evidence", toExternalEvidenceSourceRefs(record));

  return sanitizeKnowledgeResponse(knowledgeSourceKinds.map((kind) => buckets[kind]));
}

function createEmptyBuckets(): Record<KnowledgeSourceKind, KnowledgeSourceBucket> {
  return knowledgeSourceKinds.reduce(
    (buckets, kind) => ({
      ...buckets,
      [kind]: {
        kind,
        label: bucketLabels[kind],
        required: bucketRequired[kind],
        items: [],
        warnings: [],
      },
    }),
    {} as Record<KnowledgeSourceKind, KnowledgeSourceBucket>,
  );
}

function addItems(
  buckets: Record<KnowledgeSourceKind, KnowledgeSourceBucket>,
  kind: KnowledgeSourceKind,
  items: KnowledgeSourceRef[],
) {
  const seen = new Set(buckets[kind].items.map((item) => item.id));
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    buckets[kind].items.push(item);
    seen.add(item.id);
  }
}

function addWarning(bucket: KnowledgeSourceBucket, warning: string) {
  if (!bucket.warnings.includes(warning)) {
    bucket.warnings.push(warning);
  }
}

function isLegalEvidence(evidence: AssistantEvidence) {
  return evidence.kind === "regulation" || Boolean(evidence.legal);
}

function toLegalEvidenceSourceRef(evidence: AssistantEvidence): KnowledgeSourceRef {
  return buildSourceRef({
    kind: "legal_evidence",
    sourceId: evidence.recordId || evidence.legal?.sourceId || evidence.id,
    title: evidence.title || evidence.lawName || "Legal evidence",
    locator: stringifyLocator(evidence.legal?.locator) || evidence.articleLabel || evidence.articleNumber || evidence.id,
    excerpt: evidence.excerpt,
    sourceUrl: evidence.apiSourceUrl || evidence.sourceUrl || null,
    digestSeed: [evidence.id, evidence.title, evidence.excerpt, evidence.checkedAt],
    authorityRank: normalizeAuthorityRank(evidence.legal?.authorityRank, 80),
    verifiedAt: normalizeOptionalText(evidence.checkedAt) || null,
    stale: evidence.legal?.stale ?? evidence.verificationStatus === "failed",
    legalChangeWarnings: evidence.legal?.legalChangeWarnings ?? [],
    allowedUse: "legal_basis",
  });
}

function toTaskContextSourceRef(record: AssistantRecord): KnowledgeSourceRef {
  const taskIssueId = readOptionalString((record as { taskIssueId?: unknown }).taskIssueId) || record.taskId;
  return buildSourceRef({
    kind: "task_context",
    sourceId: record.taskId,
    title: "Knowledge candidate task context",
    locator: `taskId:${record.taskId}; taskIssueId:${taskIssueId}`,
    excerpt: [`Question: ${record.question}`, `Answer: ${record.answer}`].join("\n\n"),
    sourceUrl: null,
    digestSeed: [record.id, record.taskId, taskIssueId, record.question, record.answer],
    authorityRank: 30,
    verifiedAt: record.updatedAt,
    stale: false,
    legalChangeWarnings: [],
    allowedUse: "context",
  });
}

function toProjectDocumentSourceRef(evidence: AssistantEvidence): KnowledgeSourceRef {
  return buildSourceRef({
    kind: "project_document",
    sourceId: evidence.recordId || evidence.id,
    title: evidence.title || "Project document evidence",
    locator: evidence.recordId || evidence.id,
    excerpt: evidence.excerpt,
    sourceUrl: evidence.sourceUrl || null,
    digestSeed: [evidence.id, evidence.title, evidence.excerpt],
    authorityRank: 40,
    verifiedAt: evidence.checkedAt || null,
    stale: evidence.verificationStatus === "failed",
    legalChangeWarnings: evidence.legal?.legalChangeWarnings ?? [],
    allowedUse: "context",
  });
}

function toApprovedWikiSourceRef(item: ApprovedKnowledgeItem): KnowledgeSourceRef {
  return buildSourceRef({
    kind: "approved_wiki",
    sourceId: item.id,
    title: item.title,
    locator: `approvedKnowledgeItem:${item.id}`,
    excerpt: item.summary || item.bodyMarkdown.slice(0, 500),
    sourceUrl: null,
    digestSeed: [item.id, item.title, item.summary, item.bodyMarkdown, item.approvedAt],
    authorityRank: 60,
    verifiedAt: item.approvedAt,
    stale: false,
    legalChangeWarnings: [],
    allowedUse: "comparison",
  });
}

function toLocalWikiSourceRef(
  record: AssistantRecord,
  source: NonNullable<AssistantRecord["metadata"]["knowledgeCandidateSource"]>,
): KnowledgeSourceRef {
  const digest = normalizeOptionalText(source.sourceDigest);
  return buildSourceRef({
    kind: "local_wiki",
    sourceId: source.refId,
    title: "Local WIKI import",
    locator: `localWikiImport:${source.refId}`,
    excerpt: record.answer,
    sourceUrl: null,
    digestSeed: digest ? [digest] : [source.refId, record.id, record.answer],
    digest,
    authorityRank: 35,
    verifiedAt: normalizeOptionalText(source.importedAt) || null,
    stale: false,
    legalChangeWarnings: [],
    allowedUse: "context",
  });
}

function toExternalEvidenceSourceRefs(record: AssistantRecord): KnowledgeSourceRef[] {
  const refs: KnowledgeSourceRef[] = [];
  const metadataEvidence = record.metadata.externalEvidence;
  if (metadataEvidence) {
    refs.push(
      buildSourceRef({
        kind: "external_evidence",
        sourceId: metadataEvidence.id,
        title: metadataEvidence.title,
        locator: `externalEvidence:${metadataEvidence.id}`,
        excerpt: metadataEvidence.excerpt,
        sourceUrl: metadataEvidence.sourceUrl || null,
        digestSeed: [metadataEvidence.id, metadataEvidence.title, metadataEvidence.excerpt, metadataEvidence.capturedAt],
        authorityRank: 25,
        verifiedAt: metadataEvidence.capturedAt,
        stale: false,
        legalChangeWarnings: [],
        allowedUse: "citation",
      }),
    );
  }

  for (const evidence of record.evidence.filter((item) => item.kind === "web_or_skill")) {
    refs.push(
      buildSourceRef({
        kind: "external_evidence",
        sourceId: evidence.recordId || evidence.id,
        title: evidence.title || "External evidence",
        locator: evidence.recordId || evidence.id,
        excerpt: evidence.excerpt,
        sourceUrl: evidence.sourceUrl || null,
        digestSeed: [evidence.id, evidence.title, evidence.excerpt, evidence.sourceUrl],
        authorityRank: 25,
        verifiedAt: evidence.checkedAt || null,
        stale: evidence.verificationStatus === "failed",
        legalChangeWarnings: evidence.legal?.legalChangeWarnings ?? [],
        allowedUse: "citation",
      }),
    );
  }

  return refs;
}

function buildSourceRef(input: {
  kind: KnowledgeSourceKind;
  sourceId: string;
  title: string;
  locator: string;
  excerpt: string;
  sourceUrl: string | null;
  digestSeed: unknown[];
  digest?: string;
  authorityRank: number;
  verifiedAt: string | null;
  stale: boolean;
  legalChangeWarnings: string[];
  allowedUse: KnowledgeAllowedUse;
}): KnowledgeSourceRef {
  return {
    id: `${input.kind}:${stableDigest([input.sourceId, input.locator]).slice(0, 16)}`,
    sourceKind: input.kind,
    sourceId: input.sourceId,
    title: input.title,
    locator: input.locator,
    excerpt: input.excerpt,
    sourceUrl: input.sourceUrl,
    digest: input.digest ?? stableDigest(input.digestSeed),
    authorityRank: input.authorityRank,
    verifiedAt: input.verifiedAt,
    stale: input.stale,
    legalChangeWarnings: input.legalChangeWarnings,
    allowedUse: input.allowedUse,
  };
}

function buildApprovedKnowledgeQuery(record: AssistantRecord) {
  return [
    record.question,
    record.draftSummary?.conclusion,
    record.draftSummary?.tags?.join(" "),
    record.answer.slice(0, 500),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}

function stringifyLocator(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return JSON.stringify(value);
}

function normalizeAuthorityRank(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = normalizeOptionalText(value).toLowerCase();
  if (!text) {
    return fallback;
  }
  if (text.includes("primary") || text.includes("official") || text.includes("statute")) {
    return 90;
  }
  if (text.includes("secondary")) {
    return 50;
  }
  return fallback;
}

function stableDigest(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function normalizeRequiredText(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw notFound("Knowledge candidate not found", "KNOWLEDGE_CANDIDATE_NOT_FOUND");
  }
  return normalized;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
