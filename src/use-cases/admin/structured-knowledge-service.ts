import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  ApprovedKnowledgeItem,
  AssistantEvidence,
  AssistantEvidenceKind,
  KnowledgePublicationScope,
} from "@/domains/assistant/types";
import type {
  KnowledgeAllowedUse,
  KnowledgeApprovalReadiness,
  KnowledgeReviewIssue,
  KnowledgeSourceKind,
  KnowledgeSourceRef,
  StructuredKnowledgeDraft,
} from "@/domains/knowledge/structured-knowledge";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { renderStructuredKnowledgeMarkdown } from "@/use-cases/admin/knowledge-structured-draft-service";
import type { KnowledgeSourceBucket } from "@/use-cases/admin/knowledge-source-bucket-service";

export type PublishStructuredKnowledgeFromCandidateInput = {
  tx: Prisma.TransactionClient;
  recordId: string;
  legacyPublicId?: string | null;
  draft: StructuredKnowledgeDraft;
  generationRunId?: string | null;
  approvedBy: string;
};

export type StructuredKnowledgePublishPolicyInput = {
  draft: StructuredKnowledgeDraft;
  sourceBuckets?: KnowledgeSourceBucket[];
  requestedScope?: KnowledgePublicationScope | null;
};

export function canonicalizeStructuredKnowledgeDraftForApproval(input: {
  draft: StructuredKnowledgeDraft;
  sourceBuckets: KnowledgeSourceBucket[];
}): StructuredKnowledgeDraft {
  const submittedSources = normalizeKnowledgeSourceRefs(input.draft.sourceRefs);
  const canonicalSources = new Map<string, KnowledgeSourceRef>();
  for (const bucket of input.sourceBuckets) {
    for (const source of normalizeKnowledgeSourceRefs(bucket.items)) {
      canonicalSources.set(source.id, source);
    }
  }
  const sourceRefs = submittedSources.map((source) => {
    const canonical = canonicalSources.get(source.id);
    if (!canonical) {
      throw badRequest("Structured WIKI sourceRef is not present in the current server source buckets.", "STRUCTURED_WIKI_SOURCE_REF_NOT_IN_BUCKET");
    }
    return canonical;
  });
  const canonicalDraft: StructuredKnowledgeDraft = {
    ...input.draft,
    sourceRefs,
  };
  return {
    ...canonicalDraft,
    approvalReadiness: buildServerApprovalReadiness(canonicalDraft, sourceRefs),
  };
}

type CandidateLineage = {
  id: string;
  taskId: string;
  projectId: string;
};

export function createStableKnowledgePublicId(recordId: string) {
  return `approved-wiki-${stableDigest(normalizeRequiredText(recordId)).slice(0, 24)}`;
}

export function createStableStructuredKnowledgeSyntheticId(kind: "item" | "version", seed: string) {
  return `local-${kind}-${stableDigest(normalizeRequiredText(seed)).slice(0, 24)}`;
}

export async function publishStructuredKnowledgeFromCandidate(
  input: PublishStructuredKnowledgeFromCandidateInput,
): Promise<ApprovedKnowledgeItem> {
  assertStructuredKnowledgeDraftPublishable(input.draft);

  const record = await input.tx.assistantTaskRecord.findUnique({
    where: { id: input.recordId },
    select: { id: true, taskId: true, projectId: true },
  });
  if (!record) {
    throw notFound("Knowledge candidate not found", "KNOWLEDGE_CANDIDATE_NOT_FOUND");
  }
  await assertGenerationRunMatchesDraft({
    tx: input.tx,
    recordId: record.id,
    generationRunId: input.generationRunId,
    draft: input.draft,
  });

  const publicId = input.legacyPublicId || createStableKnowledgePublicId(input.recordId);
  const sourceRefs = normalizeKnowledgeSourceRefs(input.draft.sourceRefs);
  const bodyMarkdown = renderStructuredKnowledgeMarkdown({
    ...input.draft,
    sourceRefs,
  });
  assertPublishableStructuredKnowledgeBody(bodyMarkdown);
  const publishedDraft: StructuredKnowledgeDraft = {
    ...input.draft,
    sourceRefs,
    markdown: bodyMarkdown,
  };
  const scope = normalizePublicationScope(input.draft.ontology.scope);
  const projectId = scope === "organization" ? null : record.projectId;
  const approvedAt = new Date();

  const item = await input.tx.knowledgeItem.upsert({
    where: { publicId },
    update: {
      projectId,
      state: "active",
      title: input.draft.title,
      slug: input.draft.slug,
      scope,
      tags: toInputJson(input.draft.tags),
      ontology: toInputJson(input.draft.ontology),
      updatedBy: input.approvedBy,
    },
    create: {
      publicId,
      projectId,
      state: "active",
      title: input.draft.title,
      slug: input.draft.slug,
      scope,
      tags: toInputJson(input.draft.tags),
      ontology: toInputJson(input.draft.ontology),
      createdBy: input.approvedBy,
      updatedBy: input.approvedBy,
    },
    select: { id: true },
  });
  const latest = await input.tx.knowledgeItemVersion.findFirst({
    where: { itemId: item.id },
    orderBy: { version: "desc" },
    select: { id: true, version: true },
  });
  const latestApproved = await input.tx.knowledgeItemVersion.findFirst({
    where: { itemId: item.id, state: "approved" },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  const version = (latest?.version ?? 0) + 1;
  await input.tx.knowledgeItemVersion.updateMany({
    where: { itemId: item.id, state: "approved" },
    data: { state: "superseded" },
  });
  const created = await input.tx.knowledgeItemVersion.create({
    data: {
      itemId: item.id,
      version,
      state: "approved",
      title: input.draft.title,
      summary: input.draft.summary,
      bodyMarkdown,
      structuredDraft: toInputJson(publishedDraft),
      toc: toInputJson(input.draft.toc),
      sectionBlocks: toInputJson(input.draft.sections),
      contentDigest: stableDigest(bodyMarkdown),
      sourceDigest: stableDigest(sourceRefs),
      sourceRecordId: record.id,
      sourceTaskId: record.taskId,
      sourceProjectId: record.projectId,
      generationRunId: input.generationRunId || null,
      approvedBy: input.approvedBy,
      approvedAt,
      supersedesId: latestApproved?.id ?? null,
    },
    select: { id: true },
  });

  if (sourceRefs.length > 0) {
    await input.tx.knowledgeSourceReference.createMany({
      data: sourceRefs.map((source) => ({
        sourceRefId: source.id,
        itemId: item.id,
        versionId: created.id,
        sourceKind: source.sourceKind,
        sourceId: source.sourceId,
        title: source.title,
        locator: source.locator,
        excerpt: source.excerpt,
        sourceUrl: source.sourceUrl,
        digest: source.digest,
        authorityRank: source.authorityRank,
        verifiedAt: parseDateOrNull(source.verifiedAt),
        stale: source.stale,
        legalChangeWarnings: toInputJson(source.legalChangeWarnings),
        allowedUse: source.allowedUse,
      })),
    });
  }

  return createApprovedKnowledgeSnapshotFromStructuredDraft({
    publicId,
    record,
    draft: publishedDraft,
    generationRunId: input.generationRunId || null,
    approvedBy: input.approvedBy,
    approvedAt: approvedAt.toISOString(),
    structuredKnowledgeItemId: item.id,
    structuredKnowledgeVersionId: created.id,
  });
}

export function assertStructuredKnowledgeDraftPublishable(
  input: StructuredKnowledgeDraft | StructuredKnowledgePublishPolicyInput,
) {
  const draft = isPublishPolicyInput(input) ? input.draft : input;
  const sourceBuckets = isPublishPolicyInput(input) ? input.sourceBuckets : undefined;
  const requestedScope = isPublishPolicyInput(input) ? input.requestedScope : undefined;
  const sourceRefs = normalizeKnowledgeSourceRefs(draft.sourceRefs);
  assertStructuredSourceReferencesPublishable(draft, sourceRefs, sourceBuckets);
  const scope = normalizePublicationScope(draft.ontology.scope);
  if (requestedScope && normalizePublicationScope(requestedScope) !== scope) {
    throw badRequest("Structured WIKI scope does not match the approval request.", "STRUCTURED_WIKI_SCOPE_MISMATCH");
  }
  assertStructuredScopeAllowed(scope, sourceRefs);
  const serverReadiness = buildServerApprovalReadiness(draft, sourceRefs);
  if (serverReadiness.status === "blocked") {
    throw conflict("Structured WIKI draft is blocked for approval.", "STRUCTURED_WIKI_APPROVAL_BLOCKED");
  }
  assertNoUnsafePublicationValue(draft, "structuredDraft");
}

function isPublishPolicyInput(
  value: StructuredKnowledgeDraft | StructuredKnowledgePublishPolicyInput,
): value is StructuredKnowledgePublishPolicyInput {
  return Boolean(value && typeof value === "object" && "draft" in value);
}

function buildServerApprovalReadiness(
  draft: StructuredKnowledgeDraft,
  sourceRefs: KnowledgeSourceRef[],
): KnowledgeApprovalReadiness {
  const issues: KnowledgeReviewIssue[] = [];
  const sectionTocIds = new Set(draft.sections.map((section) => section.tocId));
  for (const tocItem of draft.toc.filter((item) => item.required)) {
    if (!sectionTocIds.has(tocItem.id)) {
      issues.push({
        code: "missing_required_toc_section",
        severity: "blocking",
        message: `${tocItem.title} 섹션이 필요합니다.`,
        sourceRefIds: [],
      });
    }
  }
  if (!sourceRefs.length) {
    issues.push({
      code: "missing_required_source_bucket",
      severity: "blocking",
      message: "승인 검토에 사용할 출처가 없습니다.",
      sourceRefIds: [],
    });
  }
  if (sourceRefs.length > 0 && sourceRefs.every((source) => source.sourceKind === "task_context")) {
    issues.push({
      code: "missing_required_source_bucket",
      severity: "blocking",
      message: "작업 맥락만으로는 승인 WIKI에 게시할 수 없습니다.",
      sourceRefIds: sourceRefs.map((source) => source.id),
    });
  }
  for (const source of sourceRefs) {
    if (source.allowedUse === "do_not_publish") {
      issues.push({
        code: "source_conflict",
        severity: "blocking",
        message: `${source.title} 출처는 게시 금지로 표시되어 있습니다.`,
        sourceRefIds: [source.id],
      });
    }
    if (source.stale || source.legalChangeWarnings.length > 0) {
      issues.push({
        code: "legal_freshness_warning",
        severity: "warning",
        message: `${source.title} 출처의 최신성 확인이 필요합니다.`,
        sourceRefIds: [source.id],
      });
    }
  }
  const sourceRefIds = new Set(sourceRefs.map((source) => source.id));
  for (const referencedId of collectReferencedSourceRefIds(draft)) {
    if (!sourceRefIds.has(referencedId)) {
      issues.push({
        code: "unsourced_claim",
        severity: "blocking",
        message: `알 수 없는 sourceRefId가 사용되었습니다: ${referencedId}`,
        sourceRefIds: [referencedId],
      });
    }
  }
  const blocking = issues.some((issue) => issue.severity === "blocking");
  return {
    status: blocking ? "blocked" : issues.length ? "needs_review" : "ready",
    issues,
  };
}

function collectReferencedSourceRefIds(draft: StructuredKnowledgeDraft) {
  const referencedIds = new Set<string>();
  for (const section of draft.sections) {
    for (const sourceRefId of section.sourceRefIds) {
      referencedIds.add(sourceRefId);
    }
  }
  for (const claim of draft.claimEvidenceMatrix) {
    for (const sourceRefId of claim.sourceRefIds) {
      referencedIds.add(sourceRefId);
    }
  }
  return referencedIds;
}

function assertStructuredSourceReferencesPublishable(
  draft: StructuredKnowledgeDraft,
  sourceRefs: KnowledgeSourceRef[],
  sourceBuckets?: KnowledgeSourceBucket[],
) {
  if (!sourceRefs.length) {
    throw conflict("Structured WIKI draft requires at least one source reference.", "STRUCTURED_WIKI_SOURCE_REQUIRED");
  }
  const sourceRefIds = new Set(sourceRefs.map((source) => source.id));
  for (const source of sourceRefs) {
    if (source.allowedUse === "do_not_publish") {
      throw conflict("Structured WIKI draft includes a source marked do_not_publish.", "STRUCTURED_WIKI_DO_NOT_PUBLISH_SOURCE");
    }
  }
  for (const referencedId of collectReferencedSourceRefIds(draft)) {
    if (!sourceRefIds.has(referencedId)) {
      throw badRequest("Structured WIKI draft references an unknown sourceRefId.", "STRUCTURED_WIKI_UNKNOWN_SOURCE_REF");
    }
  }
  if (!sourceBuckets) {
    return;
  }
  const canonicalSources = new Map<string, KnowledgeSourceRef>();
  for (const bucket of sourceBuckets) {
    for (const source of bucket.items) {
      canonicalSources.set(source.id, source);
    }
  }
  for (const source of sourceRefs) {
    const canonical = canonicalSources.get(source.id);
    if (!canonical) {
      throw badRequest("Structured WIKI sourceRef is not present in the current server source buckets.", "STRUCTURED_WIKI_SOURCE_REF_NOT_IN_BUCKET");
    }
    if (sourceRefPublicationFingerprint(source) !== sourceRefPublicationFingerprint(canonical)) {
      throw badRequest("Structured WIKI sourceRef no longer matches the server source bucket.", "STRUCTURED_WIKI_SOURCE_REF_STALE");
    }
  }
}

function assertStructuredScopeAllowed(scope: KnowledgePublicationScope, sourceRefs: KnowledgeSourceRef[]) {
  if (sourceRefs.every((source) => source.sourceKind === "task_context")) {
    throw conflict("Task context alone cannot be published as approved WIKI.", "STRUCTURED_WIKI_TASK_CONTEXT_ONLY");
  }
  if (scope !== "organization") {
    return;
  }
  const projectBoundSource = sourceRefs.find((source) =>
    source.sourceKind === "task_context" ||
    source.sourceKind === "project_document" ||
    source.sourceKind === "local_wiki" ||
    source.sourceKind === "approved_wiki"
  );
  if (projectBoundSource) {
    throw conflict(
      "Organization-scoped WIKI cannot cite project-bound source buckets.",
      "STRUCTURED_WIKI_ORGANIZATION_SCOPE_SOURCE_CONFLICT",
    );
  }
}

function sourceRefPublicationFingerprint(source: KnowledgeSourceRef) {
  return [
    source.id,
    source.sourceKind,
    source.sourceId,
    source.title,
    source.locator,
    source.excerpt,
    source.sourceUrl ?? "",
    source.digest,
    source.authorityRank,
    source.verifiedAt ?? "",
    source.stale,
    source.legalChangeWarnings.join("\u001e"),
    source.allowedUse,
  ].join("\u001f");
}

async function assertGenerationRunMatchesDraft(input: {
  tx: Prisma.TransactionClient;
  recordId: string;
  generationRunId?: string | null;
  draft: StructuredKnowledgeDraft;
}) {
  const generationRunId = normalizeOptionalText(input.generationRunId);
  if (!generationRunId) {
    return;
  }
  const run = await input.tx.knowledgeGenerationRun.findUnique({
    where: { id: generationRunId },
    select: { recordId: true, structuredDraft: true },
  });
  if (!run || run.recordId !== input.recordId) {
    throw badRequest("Structured WIKI generation run does not match the candidate.", "STRUCTURED_WIKI_GENERATION_RUN_MISMATCH");
  }
  const runRecord = asPlainRecord(run.structuredDraft);
  const runSources = Array.isArray(runRecord.sourceRefs)
    ? normalizeKnowledgeSourceRefs(runRecord.sourceRefs as KnowledgeSourceRef[])
    : [];
  if (!runSources.length) {
    throw conflict("Structured WIKI generation run has no source references.", "STRUCTURED_WIKI_GENERATION_RUN_INVALID");
  }
  assertCanonicalSourceRefsMatch({
    submitted: normalizeKnowledgeSourceRefs(input.draft.sourceRefs),
    canonical: runSources,
    errorCode: "STRUCTURED_WIKI_GENERATION_RUN_SOURCE_MISMATCH",
  });
}

function assertCanonicalSourceRefsMatch(input: {
  submitted: KnowledgeSourceRef[];
  canonical: KnowledgeSourceRef[];
  errorCode: string;
}) {
  if (input.submitted.length !== input.canonical.length) {
    throw badRequest("Structured WIKI sourceRefs do not match the canonical server source set.", input.errorCode);
  }
  const canonicalById = new Map(input.canonical.map((source) => [source.id, source]));
  for (const source of input.submitted) {
    const canonical = canonicalById.get(source.id);
    if (!canonical || sourceRefPublicationFingerprint(source) !== sourceRefPublicationFingerprint(canonical)) {
      throw badRequest("Structured WIKI sourceRef does not match the canonical server source.", input.errorCode);
    }
  }
}

export function createApprovedKnowledgeSnapshotFromStructuredDraft(input: {
  publicId: string;
  record: CandidateLineage;
  draft: StructuredKnowledgeDraft;
  generationRunId?: string | null;
  approvedBy: string;
  approvedAt: string;
  structuredKnowledgeItemId: string;
  structuredKnowledgeVersionId: string;
}): ApprovedKnowledgeItem {
  const bodyMarkdown = renderStructuredKnowledgeMarkdown(input.draft);
  assertPublishableStructuredKnowledgeBody(bodyMarkdown);
  return {
    id: input.publicId,
    title: input.draft.title,
    summary: input.draft.summary,
    bodyMarkdown,
    tags: input.draft.tags,
    scope: normalizePublicationScope(input.draft.ontology.scope),
    sourceRecordId: input.record.id,
    sourceTaskId: input.record.taskId,
    sourceProjectId: input.record.projectId,
    sourceReferences: toApprovedKnowledgeSourceReferences(input.draft.sourceRefs),
    structuredKnowledgeItemId: input.structuredKnowledgeItemId,
    structuredKnowledgeVersionId: input.structuredKnowledgeVersionId,
    ...(input.generationRunId ? { generationRunId: input.generationRunId } : {}),
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
  };
}

export function buildStructuredKnowledgeDraftFromLegacyCandidate(input: {
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  scope: KnowledgePublicationScope;
  sourceReferences: AssistantEvidence[];
}): StructuredKnowledgeDraft {
  const title = normalizeRequiredText(input.title);
  const summary = normalizeRequiredText(input.summary);
  const bodyMarkdown = normalizeRequiredText(input.bodyMarkdown);
  const sourceRefs = fromApprovedKnowledgeSourceReferences(input.sourceReferences);
  const sourceRefIds = sourceRefs.map((source) => source.id);
  const toc = [
    { id: "summary", level: 2 as const, title: "Summary", purpose: "summary" as const, required: true },
    { id: "body", level: 2 as const, title: "Body", purpose: "procedure" as const, required: true },
    { id: "sources", level: 2 as const, title: "Sources", purpose: "evidence" as const, required: false },
  ];
  const warnings = sourceRefs.length ? [] : ["No structured source references were available in the legacy approved item."];
  return {
    title,
    slug: slugify(title) || `knowledge-${stableDigest(title).slice(0, 12)}`,
    summary,
    tags: dedupeStrings(input.tags),
    ontology: {
      conceptId: `legacy-${stableDigest([title, summary]).slice(0, 12)}`,
      label: title,
      category: "reference",
      scope: input.scope,
      relations: [],
    },
    toc,
    sections: [
      {
        tocId: "summary",
        anchor: "summary",
        heading: "Summary",
        bodyMarkdown: summary,
        sourceRefIds,
      },
      {
        tocId: "body",
        anchor: "body",
        heading: "Body",
        bodyMarkdown,
        sourceRefIds,
      },
      {
        tocId: "sources",
        anchor: "sources",
        heading: "Sources",
        bodyMarkdown: renderLegacySourceSummary(sourceRefs),
        sourceRefIds,
      },
    ],
    reasoningSummary: "Legacy approved WIKI item converted to a structured draft for publication lineage.",
    claimEvidenceMatrix: [
      {
        claim: summary,
        sourceRefIds,
        confidence: sourceRefs.length ? "medium" : "low",
        conflicts: [],
        gaps: sourceRefs.length ? [] : ["Legacy item did not include source references."],
      },
    ],
    approvalReadiness: {
      status: warnings.length ? "needs_review" : "ready",
      issues: warnings.map((message) => ({
        code: "unsourced_claim",
        severity: "warning",
        message,
        sourceRefIds: [],
      })),
    },
    sourceRefs,
    markdown: bodyMarkdown,
    warnings,
  };
}

export function toApprovedKnowledgeSourceReferences(sourceRefs: KnowledgeSourceRef[]): AssistantEvidence[] {
  return normalizeKnowledgeSourceRefs(sourceRefs).map((source, index) => ({
    id: source.id,
    kind: toAssistantEvidenceKind(source.sourceKind),
    priority: source.authorityRank || index + 1,
    title: source.title,
    excerpt: source.excerpt,
    ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
    recordId: source.sourceId,
    confidenceWeight: source.authorityRank > 0 ? Math.min(1, source.authorityRank / 100) : undefined,
    checkedAt: source.verifiedAt ?? undefined,
    verificationStatus: source.stale || source.legalChangeWarnings.length ? "needs_review" : "verified",
    ...(source.sourceKind === "legal_evidence"
      ? {
          legal: {
            sourceId: source.sourceId,
            sourceKind: source.sourceKind,
            authorityRank: String(source.authorityRank),
            stale: source.stale,
            legalChangeWarnings: source.legalChangeWarnings,
          },
        }
      : {}),
  }));
}

function fromApprovedKnowledgeSourceReferences(sourceReferences: AssistantEvidence[]): KnowledgeSourceRef[] {
  return sourceReferences.map((source, index) => {
    const sourceKind = toKnowledgeSourceKind(source.kind);
    const sourceId = source.recordId || source.id || `legacy-source-${index + 1}`;
    const title = normalizeOptionalText(source.title) || `Source ${index + 1}`;
    const excerpt = normalizeOptionalText(source.excerpt);
    return {
      id: source.id || `${sourceKind}-${stableDigest([sourceKind, sourceId, title]).slice(0, 12)}`,
      sourceKind,
      sourceId,
      title,
      locator: normalizeOptionalText(source.articleLabel || source.articleNumber),
      excerpt,
      sourceUrl: source.sourceUrl || source.apiSourceUrl || null,
      digest: stableDigest([sourceId, title, excerpt]),
      authorityRank: source.priority ?? index + 1,
      verifiedAt: source.checkedAt ?? source.effectiveDate ?? null,
      stale: source.verificationStatus === "needs_review" || source.legal?.stale === true,
      legalChangeWarnings: source.legal?.legalChangeWarnings ?? [],
      allowedUse: toKnowledgeAllowedUse(sourceKind),
    };
  });
}

function normalizeKnowledgeSourceRefs(sourceRefs: KnowledgeSourceRef[]): KnowledgeSourceRef[] {
  const seen = new Set<string>();
  return sourceRefs
    .map((source, index) => {
      const sourceKind = toKnowledgeSourceKind(source.sourceKind);
      const sourceId = normalizeOptionalText(source.sourceId) || `${sourceKind}-${index + 1}`;
      const title = normalizeOptionalText(source.title) || `Source ${index + 1}`;
      const id = normalizeOptionalText(source.id) || `${sourceKind}-${stableDigest([sourceId, title]).slice(0, 12)}`;
      return {
        id,
        sourceKind,
        sourceId,
        title,
        locator: normalizeOptionalText(source.locator),
        excerpt: normalizeOptionalText(source.excerpt),
        sourceUrl: normalizeOptionalText(source.sourceUrl) || null,
        digest: normalizeOptionalText(source.digest) || stableDigest([sourceId, title, source.excerpt]),
        authorityRank: Number.isFinite(source.authorityRank) ? source.authorityRank : index + 1,
        verifiedAt: normalizeOptionalText(source.verifiedAt) || null,
        stale: source.stale === true,
        legalChangeWarnings: Array.isArray(source.legalChangeWarnings)
          ? source.legalChangeWarnings.map(String).filter(Boolean)
          : [],
        allowedUse: toKnowledgeAllowedUse(source.allowedUse),
      };
    })
    .filter((source) => {
      if (seen.has(source.id)) {
        return false;
      }
      seen.add(source.id);
      return true;
    });
}

function assertPublishableStructuredKnowledgeBody(bodyMarkdown: string) {
  const metadataPattern =
    /\b(taskId|taskIssueId|assistantRecord|assistant record|recordId|providerCallMode|provider|usage|estimatedCostCents|costCents|inputTokens|outputTokens|requestHash)\b/i;
  if (metadataPattern.test(bodyMarkdown)) {
    throw badRequest("Structured WIKI body contains assistant/task metadata.", "STRUCTURED_WIKI_METADATA_IN_BODY");
  }
  assertNoUnsafePublicationText(bodyMarkdown, "bodyMarkdown");
}

function assertNoUnsafePublicationValue(value: unknown, path: string) {
  if (typeof value === "string") {
    assertNoUnsafePublicationText(value, path);
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafePublicationValue(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (unsafePublicationKeyPattern.test(key)) {
      throw badRequest(
        "Structured WIKI draft contains unsafe prompt, credential, provider usage, or cost metadata.",
        "STRUCTURED_WIKI_UNSAFE_DRAFT_CONTENT",
      );
    }
    assertNoUnsafePublicationValue(nestedValue, `${path}.${key}`);
  }
}

function assertNoUnsafePublicationText(value: string, path: string) {
  if (unsafePublicationTextPattern.test(value)) {
    throw badRequest(
      `Structured WIKI draft contains unsafe prompt, credential, env file, or local path content at ${path}.`,
      "STRUCTURED_WIKI_UNSAFE_DRAFT_CONTENT",
    );
  }
}

const unsafePublicationKeyPattern =
  /^(rawPrompt|promptText|systemPrompt|developerPrompt|userPrompt|apiKey|api_key|secret|token|password|authorization|credential|providerUsage|usageMetadata|usage|cost|costCents|costMetadata|providerCost|estimatedCost|estimatedCostCents|inputTokens|outputTokens|totalTokens|promptTokens|completionTokens|tokenUsage)$/i;

const unsafePublicationTextPattern =
  /\b(rawPrompt|promptText|systemPrompt|developerPrompt|userPrompt)\b|\b([A-Z0-9_]*(?:SECRET|TOKEN|API[_-]?KEY|PASSWORD|DATABASE_URL)[A-Z0-9_]*)\s*=\s*["']?[^"'\s,;}]+|\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b|\b(env(?:File|Path)?|dotenv)\s*[:=]\s*["']?\.env[.\w-]*|(^|[\s"'(])\.env(?:[.\w-]*)?|\b[A-Za-z]:\\[^\r\n"'`]+|\\\\[^\s\\/:*?"<>|]+\\[^\r\n"'`]+|(^|[\s"'(])\/(?:Users|home|var|etc|tmp|mnt|opt|srv|root|Volumes|workspace)\/[^\r\n"'`)]+/i;

function renderLegacySourceSummary(sourceRefs: KnowledgeSourceRef[]) {
  if (!sourceRefs.length) {
    return "- No source references were preserved in the legacy approved item.";
  }
  return sourceRefs.map((source) => `- ${source.title}`).join("\n");
}

function normalizePublicationScope(value: unknown): KnowledgePublicationScope {
  return value === "admin_only" || value === "organization" || value === "project_members" || value === "project"
    ? value
    : "project_members";
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toKnowledgeSourceKind(value: unknown): KnowledgeSourceKind {
  if (
    value === "legal_evidence" ||
    value === "task_context" ||
    value === "project_document" ||
    value === "approved_wiki" ||
    value === "local_wiki" ||
    value === "external_evidence"
  ) {
    return value;
  }
  if (value === "regulation") {
    return "legal_evidence";
  }
  if (value === "task") {
    return "task_context";
  }
  if (value === "central_knowledge") {
    return "approved_wiki";
  }
  if (value === "web_or_skill") {
    return "external_evidence";
  }
  return "task_context";
}

function toAssistantEvidenceKind(value: KnowledgeSourceKind): AssistantEvidenceKind {
  if (value === "legal_evidence") {
    return "regulation";
  }
  if (value === "project_document") {
    return "project_document";
  }
  if (value === "approved_wiki" || value === "local_wiki") {
    return "central_knowledge";
  }
  if (value === "external_evidence") {
    return "web_or_skill";
  }
  return "task";
}

function toKnowledgeAllowedUse(value: unknown): KnowledgeAllowedUse {
  if (
    value === "legal_basis" ||
    value === "context" ||
    value === "comparison" ||
    value === "citation" ||
    value === "do_not_publish"
  ) {
    return value;
  }
  if (value === "legal_evidence") {
    return "legal_basis";
  }
  if (value === "approved_wiki" || value === "local_wiki") {
    return "comparison";
  }
  return "context";
}

function parseDateOrNull(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.map(normalizeOptionalText).filter(Boolean))];
}

function slugify(value: string) {
  return normalizeOptionalText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRequiredText(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw badRequest("Structured WIKI publication input is incomplete.", "STRUCTURED_WIKI_INPUT_REQUIRED");
  }
  return normalized;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stableDigest(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
