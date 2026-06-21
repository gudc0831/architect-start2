import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AssistantRecord } from "@/domains/assistant/types";
import type { AuthUser } from "@/domains/auth/types";
import {
  knowledgeSourceKinds,
  type KnowledgeApprovalReadiness,
  type KnowledgeClaimEvidence,
  type KnowledgeOntologyNode,
  type KnowledgeReviewIssue,
  type KnowledgeSection,
  type KnowledgeSourceKind,
  type KnowledgeSourceRef,
  type KnowledgeTocItem,
  type StructuredKnowledgeDraft,
} from "@/domains/knowledge/structured-knowledge";
import { notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { assistantRepository } from "@/repositories/assistant";
import {
  getKnowledgeSourceBuckets,
  type KnowledgeSourceBucket,
} from "@/use-cases/admin/knowledge-source-bucket-service";
import { backendMode } from "@/lib/backend-mode";
import { getOrCreateActiveKnowledgeGenerationProfile } from "@/use-cases/admin/knowledge-generation-profile-service";
import { sanitizeKnowledgeResponse } from "@/use-cases/admin/knowledge-response-sanitizer";

export type GenerateStructuredKnowledgeDraftInput = {
  recordId: string;
  projectId: string;
  user: AuthUser;
};

export type GenerateStructuredKnowledgeDraftResult = {
  draft: StructuredKnowledgeDraft;
  generationRunId: string;
  profileId: string;
  profileVersion: number;
  sourceBundleDigest: string;
  promptDigest: string;
  warnings: string[];
};

const sourceKindLabels = {
  legal_evidence: "법규 근거",
  task_context: "작업 맥락",
  project_document: "프로젝트 문서",
  approved_wiki: "승인된 WIKI",
  local_wiki: "로컬 WIKI",
  external_evidence: "외부 근거",
} satisfies Record<KnowledgeSourceKind, string>;

const promptBucketLabels = {
  legal_evidence: "Legal evidence bucket:",
  task_context: "Task context bucket:",
  project_document: "Project document bucket:",
  approved_wiki: "Approved WIKI bucket:",
  local_wiki: "Local WIKI bucket:",
  external_evidence: "External evidence bucket:",
} satisfies Record<KnowledgeSourceKind, string>;

export function renderStructuredKnowledgeMarkdown(draft: StructuredKnowledgeDraft) {
  const normalized = normalizeStructuredKnowledgeDraft(draft);
  const tocLines = normalized.sections.map((section) => {
    const tocItem = normalized.toc.find((item) => item.id === section.tocId);
    const label = tocItem?.title || section.heading;
    return `- [${label}](#${section.anchor})`;
  });
  const sectionBlocks = normalized.sections.map((section) => {
    const tocItem = normalized.toc.find((item) => item.id === section.tocId);
    const headingLevel = "#".repeat(Math.max(2, Math.min(3, tocItem?.level ?? 2)));
    return `${headingLevel} ${section.heading} {#${section.anchor}}\n\n${section.bodyMarkdown.trim()}`;
  });

  return [
    `# ${normalized.title}`,
    "## 목차",
    tocLines.length ? tocLines.join("\n") : "- 등록된 섹션 없음",
    "## 출처 범위",
    renderSourceCoverage(normalized.sourceRefs),
    ...sectionBlocks,
  ].join("\n\n");
}

export async function generateStructuredKnowledgeDraft(
  input: GenerateStructuredKnowledgeDraftInput,
): Promise<GenerateStructuredKnowledgeDraftResult> {
  const recordId = normalizeRequiredText(input.recordId);
  const projectId = normalizeRequiredText(input.projectId);
  const record = await assistantRepository.findRecordById(recordId);
  if (!record || record.projectId !== projectId || record.candidateState === "not_candidate") {
    throw notFound("Knowledge candidate not found", "KNOWLEDGE_CANDIDATE_NOT_FOUND");
  }

  const profile = await getOrCreateActiveKnowledgeGenerationProfile(input.user);
  const buckets = await getKnowledgeSourceBuckets({ recordId, projectId });
  const { sourceRefs, warnings: sourceWarnings } = selectSourceRefs(buckets, profile.sourceBucketRules);
  const sourceBundleDigest = stableDigest({
    profileId: profile.id,
    profileVersion: profile.version,
    buckets: buckets.map((bucket) => ({
      kind: bucket.kind,
      required: bucket.required,
      items: bucket.items.map((item) => ({
        id: item.id,
        sourceKind: item.sourceKind,
        sourceId: item.sourceId,
        locator: item.locator,
        digest: item.digest,
        stale: item.stale,
        allowedUse: item.allowedUse,
      })),
    })),
  });
  const generationPrompt = buildStructuredKnowledgePrompt({
    record,
    profileVersion: profile.version,
    buckets,
    toc: profile.tocTemplate,
    ontologySchema: profile.ontologySchema,
    citationRules: profile.citationRules,
    sectionRules: profile.sectionRules,
  });
  const promptDigest = stableDigest(generationPrompt);
  const draft = buildDeterministicDraft({
    record,
    toc: profile.tocTemplate,
    sourceRefs,
    warnings: sourceWarnings,
  });
  const warnings = dedupeStrings([...sourceWarnings, ...draft.warnings]);
  const run = backendMode === "cloud"
    ? await prisma.knowledgeGenerationRun.create({
      data: {
        recordId: record.id,
        profileId: profile.id,
        profileVersion: profile.version,
        sourceBundleDigest,
        promptDigest,
        legalVerificationStatus: deriveLegalVerificationStatus(sourceRefs),
        legalVerificationDigest: stableDigest(sourceRefs.filter((sourceRef) => sourceRef.sourceKind === "legal_evidence")),
        projectContextTraceDigest: stableDigest(
          sourceRefs.filter((sourceRef) => sourceRef.sourceKind === "task_context" || sourceRef.sourceKind === "project_document"),
        ),
        provider: "deterministic",
        model: "deterministic",
        structuredDraft: toInputJson(draft),
        warnings: toInputJson(warnings),
        createdBy: input.user.id,
      },
      select: { id: true },
    })
    : { id: randomUUID() };

  return sanitizeKnowledgeResponse({
    draft,
    generationRunId: run.id,
    profileId: profile.id,
    profileVersion: profile.version,
    sourceBundleDigest,
    promptDigest,
    warnings,
  });
}

function buildStructuredKnowledgePrompt(input: {
  record: AssistantRecord;
  profileVersion: number;
  buckets: KnowledgeSourceBucket[];
  toc: KnowledgeTocItem[];
  ontologySchema: Record<string, unknown>;
  citationRules: string[];
  sectionRules: string[];
}) {
  const bucketText = knowledgeSourceKinds.map((kind) => {
    const bucket = input.buckets.find((item) => item.kind === kind);
    const items = bucket?.items ?? [];
    return [
      promptBucketLabels[kind],
      items.length
        ? items.map((item) => `- ${item.title} | ${item.locator} | ${item.digest}`).join("\n")
        : "- none",
    ].join("\n");
  });

  return [
    `Profile version: ${input.profileVersion}`,
    `Candidate title seed: ${input.record.draftSummary?.conclusion || input.record.question}`,
    ...bucketText,
    "Ontology requirements:",
    stableStringify(input.ontologySchema),
    "TOC requirements:",
    stableStringify(input.toc),
    "Citation requirements:",
    input.citationRules.join("\n"),
    "Integrated reasoning requirements:",
    input.sectionRules.join("\n"),
  ].join("\n\n");
}

function buildDeterministicDraft(input: {
  record: AssistantRecord;
  toc: KnowledgeTocItem[];
  sourceRefs: KnowledgeSourceRef[];
  warnings: string[];
}): StructuredKnowledgeDraft {
  const title = buildTitle(input.record);
  const slug = slugify(title) || `knowledge-${stableDigest([input.record.question, input.record.answer]).slice(0, 12)}`;
  const relations = input.sourceRefs
    .filter((sourceRef) => sourceRef.sourceKind === "approved_wiki")
    .map((sourceRef) => ({
      kind: "related" as const,
      targetId: sourceRef.sourceId,
      reason: `${sourceRef.title} 항목과 비교 검토가 필요합니다.`,
    }));
  const ontology: KnowledgeOntologyNode = {
    conceptId: `knowledge-${stableDigest([title, input.sourceRefs.map((sourceRef) => sourceRef.digest)]).slice(0, 12)}`,
    label: title,
    category: input.sourceRefs.some((sourceRef) => sourceRef.sourceKind === "legal_evidence") ? "legal_rule" : "workflow",
    scope: "project_members",
    relations,
  };
  const toc = normalizeToc(input.toc, relations.length > 0);
  const sections = toc
    .filter((item) => item.required || (item.purpose === "related" && relations.length > 0))
    .map((item) => buildSection(item, input.record, input.sourceRefs, input.warnings, ontology));
  const claimEvidenceMatrix = buildClaimEvidenceMatrix(input.record, input.sourceRefs, input.warnings);
  const approvalReadiness = buildApprovalReadiness(toc, sections, input.sourceRefs, input.warnings);
  const draftWithoutMarkdown: StructuredKnowledgeDraft = {
    title,
    slug,
    summary: buildSummary(input.record),
    tags: buildTags(input.record, input.sourceRefs),
    ontology: ontology,
    toc: toc,
    sections: sections,
    reasoningSummary: buildReasoningSummary(input.sourceRefs, input.warnings),
    claimEvidenceMatrix: claimEvidenceMatrix,
    approvalReadiness: approvalReadiness,
    sourceRefs: input.sourceRefs,
    markdown: "",
    warnings: dedupeStrings(input.warnings),
  };
  const normalized = normalizeStructuredKnowledgeDraft(draftWithoutMarkdown);
  return {
    ...normalized,
    markdown: renderStructuredKnowledgeMarkdown(normalized),
  };
}

function normalizeStructuredKnowledgeDraft(draft: StructuredKnowledgeDraft): StructuredKnowledgeDraft {
  const toc: KnowledgeTocItem[] = [];
  const originalToNormalizedId = new Map<string, string>();
  const usedTocIds = new Set<string>();
  for (const item of draft.toc) {
    const normalizedId = uniqueValue(slugify(item.id || item.title) || `section-${toc.length + 1}`, usedTocIds);
    originalToNormalizedId.set(item.id, normalizedId);
    toc.push({ ...item, id: normalizedId });
  }

  const usedAnchors = new Set<string>();
  const sections: KnowledgeSection[] = draft.sections.map((section, index) => {
    const matchedToc = findMatchingTocItem(section, toc, originalToNormalizedId);
    const tocItem = matchedToc ?? createTocItemForSection(section, index, usedTocIds);
    if (!matchedToc) {
      toc.push(tocItem);
    }
    const anchorSeed = section.anchor || tocItem.id || section.heading;
    return {
      ...section,
      tocId: tocItem.id,
      anchor: uniqueValue(slugify(anchorSeed) || `section-${stableDigest([tocItem.id, section.heading]).slice(0, 12)}`, usedAnchors),
      heading: normalizeRequiredText(section.heading || tocItem.title),
      bodyMarkdown: normalizeOptionalText(section.bodyMarkdown) || "검토 가능한 본문이 아직 없습니다.",
      sourceRefIds: dedupeStrings(section.sourceRefIds.filter((sourceRefId) => typeof sourceRefId === "string")),
    };
  });

  if (draft.ontology.relations.length > 0 && !sections.some((section) => section.heading === "관련 WIKI")) {
    const relatedToc: KnowledgeTocItem = toc.find((item) => item.purpose === "related") ?? {
      id: uniqueValue("related", usedTocIds),
      level: 2,
      title: "관련 WIKI",
      purpose: "related" as const,
      required: false,
    };
    if (!toc.some((item) => item.id === relatedToc.id)) {
      toc.push(relatedToc);
    }
    sections.push({
      tocId: relatedToc.id,
      anchor: uniqueValue(slugify(relatedToc.id) || "related", usedAnchors),
      heading: "관련 WIKI",
      bodyMarkdown: renderOntologyRelations(draft.ontology),
      sourceRefIds: draft.sourceRefs.filter((sourceRef) => sourceRef.sourceKind === "approved_wiki").map((sourceRef) => sourceRef.id),
    });
  }

  return {
    ...draft,
    toc,
    sections,
    warnings: dedupeStrings(draft.warnings),
  };
}

function findMatchingTocItem(
  section: KnowledgeSection,
  toc: KnowledgeTocItem[],
  originalToNormalizedId: Map<string, string>,
) {
  const normalizedId = originalToNormalizedId.get(section.tocId) || slugify(section.tocId);
  return toc.find((item) => item.id === normalizedId) ??
    toc.find((item) => normalizeOptionalText(item.title) === normalizeOptionalText(section.heading));
}

function createTocItemForSection(section: KnowledgeSection, index: number, usedTocIds: Set<string>): KnowledgeTocItem {
  const title = normalizeOptionalText(section.heading) || `섹션 ${index + 1}`;
  return {
    id: uniqueValue(slugify(section.tocId || title) || `section-${index + 1}`, usedTocIds),
    level: 2,
    title,
    purpose: "history",
    required: true,
  };
}

function normalizeToc(toc: KnowledgeTocItem[], hasRelations: boolean): KnowledgeTocItem[] {
  const used = new Set<string>();
  const normalized = toc
    .filter((item) => item.required || item.purpose !== "related" || hasRelations)
    .map<KnowledgeTocItem>((item, index) => ({
      ...item,
      id: uniqueValue(slugify(item.id || item.title) || `section-${index + 1}`, used),
      level: normalizeTocLevel(item.level),
    }));
  if (hasRelations && !normalized.some((item) => item.purpose === "related")) {
    normalized.push({
      id: uniqueValue("related", used),
      level: 2,
      title: "관련 WIKI",
      purpose: "related",
      required: false,
    });
  }
  return normalized;
}

function normalizeTocLevel(level: KnowledgeTocItem["level"]): KnowledgeTocItem["level"] {
  return level === 1 || level === 3 ? level : 2;
}

function buildSection(
  tocItem: KnowledgeTocItem,
  record: AssistantRecord,
  sourceRefs: KnowledgeSourceRef[],
  warnings: string[],
  ontology: KnowledgeOntologyNode,
): KnowledgeSection {
  const sourceRefIds = selectSectionSourceRefs(tocItem.purpose, sourceRefs);
  return {
    tocId: tocItem.id,
    anchor: slugify(tocItem.id) || `section-${stableDigest(tocItem).slice(0, 12)}`,
    heading: tocItem.title,
    bodyMarkdown: buildSectionBody(tocItem, record, sourceRefs, warnings, ontology),
    sourceRefIds,
  };
}

function buildSectionBody(
  tocItem: KnowledgeTocItem,
  record: AssistantRecord,
  sourceRefs: KnowledgeSourceRef[],
  warnings: string[],
  ontology: KnowledgeOntologyNode,
) {
  if (tocItem.purpose === "summary") {
    return [
      buildSummary(record),
      "",
      `재사용 범위: ${sourceRefs.length}개 출처를 기준으로 공통 WIKI 초안을 구성했습니다.`,
    ].join("\n");
  }
  if (tocItem.purpose === "applicability") {
    return [
      "다음 조건에서 우선 적용합니다.",
      `- 후보 답변의 핵심 질문: ${compactText(record.question, 180)}`,
      `- 출처 유형: ${knowledgeSourceKinds.filter((kind) => sourceRefs.some((sourceRef) => sourceRef.sourceKind === kind)).map((kind) => sourceKindLabels[kind]).join(", ") || "검토 가능한 출처 없음"}`,
    ].join("\n");
  }
  if (tocItem.purpose === "procedure") {
    return [
      "1. 출처 범위의 법규 근거와 프로젝트 문서를 먼저 확인합니다.",
      "2. 승인된 WIKI 또는 로컬 WIKI와 충돌하는 설명이 있는지 비교합니다.",
      "3. 근거가 부족하거나 오래된 항목은 승인 전 보강 대상으로 표시합니다.",
    ].join("\n");
  }
  if (tocItem.purpose === "evidence") {
    return renderEvidenceSection(sourceRefs);
  }
  if (tocItem.purpose === "exception") {
    return warnings.length
      ? warnings.map((warning) => `- ${warning}`).join("\n")
      : "- 현재 자동 생성 단계에서 확인된 예외나 차단 사유는 없습니다.";
  }
  if (tocItem.purpose === "related") {
    return renderOntologyRelations(ontology);
  }
  return compactText(record.answer, 800);
}

function buildClaimEvidenceMatrix(
  record: AssistantRecord,
  sourceRefs: KnowledgeSourceRef[],
  warnings: string[],
): KnowledgeClaimEvidence[] {
  const legalSourceIds = sourceRefs.filter((sourceRef) => sourceRef.allowedUse === "legal_basis").map((sourceRef) => sourceRef.id);
  const contextSourceIds = sourceRefs.filter((sourceRef) => sourceRef.allowedUse !== "legal_basis").map((sourceRef) => sourceRef.id);
  return [
    {
      claim: buildSummary(record),
      sourceRefIds: contextSourceIds.length ? contextSourceIds : sourceRefs.map((sourceRef) => sourceRef.id),
      confidence: warnings.length ? "medium" : "high",
      conflicts: [],
      gaps: warnings.filter((warning) => warning.includes("누락") || warning.includes("부족")),
    },
    {
      claim: "법규 판단은 검증된 법규 근거가 있는 경우에만 승인해야 합니다.",
      sourceRefIds: legalSourceIds,
      confidence: legalSourceIds.length ? "high" : "low",
      conflicts: [],
      gaps: legalSourceIds.length ? [] : ["법규 근거가 없거나 검증 대상이 아닙니다."],
    },
  ];
}

function buildApprovalReadiness(
  toc: KnowledgeTocItem[],
  sections: KnowledgeSection[],
  sourceRefs: KnowledgeSourceRef[],
  warnings: string[],
): KnowledgeApprovalReadiness {
  const issues: KnowledgeReviewIssue[] = [];
  for (const item of toc.filter((tocItem) => tocItem.required)) {
    if (!sections.some((section) => section.tocId === item.id)) {
      issues.push({
        code: "missing_required_toc_section",
        severity: "blocking",
        message: `${item.title} 섹션이 필요합니다.`,
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
  if (sourceRefs.length > 0 && sourceRefs.every((sourceRef) => sourceRef.sourceKind === "task_context")) {
    issues.push({
      code: "missing_required_source_bucket",
      severity: "blocking",
      message: "작업 맥락만으로는 승인 WIKI에 게시할 수 없습니다. 법규 근거, 프로젝트 자료, 기존 WIKI, 로컬 WIKI 또는 외부 근거를 추가하세요.",
      sourceRefIds: sourceRefs.map((sourceRef) => sourceRef.id),
    });
  }
  for (const sourceRef of sourceRefs.filter((item) => item.stale || item.legalChangeWarnings.length > 0)) {
    issues.push({
      code: "legal_freshness_warning",
      severity: "warning",
      message: `${sourceRef.title} 출처의 최신성 확인이 필요합니다.`,
      sourceRefIds: [sourceRef.id],
    });
  }
  for (const warning of warnings) {
    issues.push({
      code: warning.includes("누락") ? "missing_required_source_bucket" : "unsourced_claim",
      severity: warning.includes("필수") ? "blocking" : "warning",
      message: warning,
      sourceRefIds: [],
    });
  }
  const blocking = issues.some((issue) => issue.severity === "blocking");
  return {
    status: blocking ? "blocked" : issues.length ? "needs_review" : "ready",
    issues,
  };
}

function selectSourceRefs(
  buckets: KnowledgeSourceBucket[],
  rules: Record<KnowledgeSourceKind, { required: boolean; maxItems: number }>,
) {
  const sourceRefs: KnowledgeSourceRef[] = [];
  const warnings: string[] = [];
  for (const kind of knowledgeSourceKinds) {
    const bucket = buckets.find((item) => item.kind === kind);
    const rule = rules[kind] ?? { required: kind === "task_context", maxItems: 6 };
    const items = (bucket?.items ?? []).slice(0, rule.maxItems);
    sourceRefs.push(...items);
    if (rule.required && items.length === 0) {
      warnings.push(`필수 출처 버킷 누락: ${sourceKindLabels[kind]}`);
    }
    if ((bucket?.items.length ?? 0) > items.length) {
      warnings.push(`${sourceKindLabels[kind]} 출처가 ${rule.maxItems}개로 제한되었습니다.`);
    }
    warnings.push(...(bucket?.warnings ?? []));
  }
  return { sourceRefs: dedupeSourceRefs(sourceRefs), warnings: dedupeStrings(warnings) };
}

function selectSectionSourceRefs(purpose: KnowledgeTocItem["purpose"], sourceRefs: KnowledgeSourceRef[]) {
  if (purpose === "evidence") {
    return sourceRefs.map((sourceRef) => sourceRef.id);
  }
  if (purpose === "related") {
    return sourceRefs.filter((sourceRef) => sourceRef.sourceKind === "approved_wiki").map((sourceRef) => sourceRef.id);
  }
  if (purpose === "applicability") {
    return sourceRefs
      .filter((sourceRef) => sourceRef.sourceKind === "legal_evidence" || sourceRef.sourceKind === "project_document")
      .map((sourceRef) => sourceRef.id);
  }
  return sourceRefs.filter((sourceRef) => sourceRef.sourceKind === "task_context").map((sourceRef) => sourceRef.id);
}

function renderSourceCoverage(sourceRefs: KnowledgeSourceRef[]) {
  if (!sourceRefs.length) {
    return "- 검토 가능한 출처 없음";
  }
  const lines = [`- 전체 출처: ${sourceRefs.length}개`];
  for (const kind of knowledgeSourceKinds) {
    const refs = sourceRefs.filter((sourceRef) => sourceRef.sourceKind === kind);
    if (!refs.length) {
      continue;
    }
    const staleCount = refs.filter((sourceRef) => sourceRef.stale).length;
    const verifiedCount = refs.filter((sourceRef) => sourceRef.verifiedAt).length;
    lines.push(`- ${sourceKindLabels[kind]}: ${refs.length}개 (검증일 있음 ${verifiedCount}개, 최신성 주의 ${staleCount}개)`);
    lines.push(...refs.map((sourceRef) => `  - ${renderPublishableSourceRef(sourceRef)}`));
  }
  return lines.join("\n");
}

function renderEvidenceSection(sourceRefs: KnowledgeSourceRef[]) {
  if (!sourceRefs.length) {
    return "- 승인 전 출처 보강이 필요합니다.";
  }
  return sourceRefs
    .map((sourceRef) => {
      const warnings = sourceRef.legalChangeWarnings.length
        ? ` / 주의: ${sourceRef.legalChangeWarnings.join(", ")}`
        : "";
      return `- ${sourceKindLabels[sourceRef.sourceKind]}: ${sourceRef.title}${warnings}`;
    })
    .join("\n");
}

function renderOntologyRelations(ontology: KnowledgeOntologyNode) {
  if (!ontology.relations.length) {
    return "- 연결된 WIKI 관계가 없습니다.";
  }
  return ontology.relations
    .map((relation) => `- ${relation.kind}: ${relation.targetId} - ${relation.reason}`)
    .join("\n");
}

function renderPublishableSourceRef(sourceRef: KnowledgeSourceRef) {
  const locator = safePublicationLocator(sourceRef.locator);
  const verifiedAt = sourceRef.verifiedAt ? ` / 검증일: ${sourceRef.verifiedAt}` : "";
  return `${sourceRef.title}${locator ? ` (${locator})` : ""}${verifiedAt}`;
}

function safePublicationLocator(locator: string) {
  const normalized = normalizeOptionalText(locator);
  if (!normalized || /(taskId|taskIssueId|assistant record|assistantRecord|recordId|task:)/i.test(normalized)) {
    return "";
  }
  return compactText(normalized, 120);
}

function deriveLegalVerificationStatus(sourceRefs: KnowledgeSourceRef[]) {
  const legalRefs = sourceRefs.filter((sourceRef) => sourceRef.sourceKind === "legal_evidence");
  if (!legalRefs.length) {
    return "not_required";
  }
  if (legalRefs.some((sourceRef) => sourceRef.stale || sourceRef.legalChangeWarnings.length > 0)) {
    return "needs_review";
  }
  return "verified";
}

function buildTitle(record: AssistantRecord) {
  return compactText(record.draftSummary?.conclusion || record.question || "구조화 지식 초안", 100);
}

function buildSummary(record: AssistantRecord) {
  return compactText(record.draftSummary?.conclusion || firstParagraph(record.answer) || record.question, 320);
}

function buildTags(record: AssistantRecord, sourceRefs: KnowledgeSourceRef[]) {
  return dedupeStrings([
    ...(record.draftSummary?.tags ?? []),
    ...knowledgeSourceKinds.filter((kind) => sourceRefs.some((sourceRef) => sourceRef.sourceKind === kind)),
  ]).slice(0, 12);
}

function buildReasoningSummary(sourceRefs: KnowledgeSourceRef[], warnings: string[]) {
  const bucketSummary = knowledgeSourceKinds
    .map((kind) => `${sourceKindLabels[kind]} ${sourceRefs.filter((sourceRef) => sourceRef.sourceKind === kind).length}개`)
    .join(", ");
  return warnings.length
    ? `${bucketSummary}를 통합했으며, 승인 전 ${warnings.length}개 경고를 검토해야 합니다.`
    : `${bucketSummary}를 통합해 승인 가능한 구조화 초안을 생성했습니다.`;
}

function dedupeSourceRefs(sourceRefs: KnowledgeSourceRef[]) {
  const seen = new Set<string>();
  return sourceRefs.filter((sourceRef) => {
    if (seen.has(sourceRef.id)) {
      return false;
    }
    seen.add(sourceRef.id);
    return true;
  });
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.map(normalizeOptionalText).filter(Boolean))];
}

function uniqueValue(value: string, used: Set<string>) {
  const base = value || "section";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function slugify(value: string) {
  return normalizeOptionalText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstParagraph(value: string) {
  return normalizeOptionalText(value).split(/\n\s*\n/)[0] ?? "";
}

function compactText(value: string, maxLength: number) {
  const compacted = normalizeOptionalText(value).replace(/\s+/g, " ");
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
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
