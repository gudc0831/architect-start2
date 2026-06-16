import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ApprovedKnowledgeItem } from "@/domains/assistant/types";
import type {
  KnowledgeAllowedUse,
  KnowledgeGenerationProfile,
  KnowledgeOntologyNode,
  KnowledgeSection,
  KnowledgeSourceKind,
  KnowledgeSourceRef,
  KnowledgeTocItem,
  StructuredKnowledgeDraft,
} from "@/domains/knowledge/structured-knowledge";
import { prisma } from "@/lib/prisma";
import type {
  CreateKnowledgeItemInput,
  PublishKnowledgeVersionInput,
  StructuredKnowledgeRepository,
} from "@/repositories/knowledge/contracts";
import { toApprovedKnowledgeSourceReferences } from "@/use-cases/admin/structured-knowledge-service";

function createDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function asToc(value: unknown): KnowledgeTocItem[] {
  return Array.isArray(value) ? (value as KnowledgeTocItem[]) : [];
}

function asSections(value: unknown): KnowledgeSection[] {
  return Array.isArray(value) ? (value as KnowledgeSection[]) : [];
}

function normalizeOntology(value: unknown, fallback: KnowledgeOntologyNode): KnowledgeOntologyNode {
  const record = asRecord(value);
  return {
    conceptId: typeof record.conceptId === "string" && record.conceptId ? record.conceptId : fallback.conceptId,
    label: typeof record.label === "string" && record.label ? record.label : fallback.label,
    category:
      record.category === "legal_rule" ||
      record.category === "workflow" ||
      record.category === "project_condition" ||
      record.category === "design_decision" ||
      record.category === "reference"
        ? record.category
        : fallback.category,
    scope:
      record.scope === "organization" ||
      record.scope === "project" ||
      record.scope === "project_members" ||
      record.scope === "admin_only"
        ? record.scope
        : fallback.scope,
    relations: Array.isArray(record.relations) ? (record.relations as KnowledgeOntologyNode["relations"]) : fallback.relations,
  };
}

function normalizeAllowedUse(value: unknown): KnowledgeAllowedUse {
  return value === "legal_basis" ||
    value === "context" ||
    value === "comparison" ||
    value === "citation" ||
    value === "do_not_publish"
    ? value
    : "context";
}

function normalizeSourceKind(value: unknown): KnowledgeSourceKind {
  return value === "legal_evidence" ||
    value === "task_context" ||
    value === "project_document" ||
    value === "approved_wiki" ||
    value === "local_wiki" ||
    value === "external_evidence"
    ? value
    : "task_context";
}

type PrismaKnowledgeSourceReference = {
  id: string;
  sourceRefId: string;
  sourceKind: string;
  sourceId: string;
  title: string;
  locator: string;
  excerpt: string;
  sourceUrl: string | null;
  digest: string;
  authorityRank: number;
  verifiedAt: Date | null;
  stale: boolean;
  legalChangeWarnings: Prisma.JsonValue;
  allowedUse: string;
};

type PrismaKnowledgeItemWithVersion = {
  id: string;
  title: string;
  publicId: string;
  projectId: string | null;
  slug: string;
  scope: string;
  tags: Prisma.JsonValue;
  ontology: Prisma.JsonValue;
};

type PrismaKnowledgeItemVersionWithRelations = {
  id: string;
  itemId: string;
  version: number;
  state: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  structuredDraft: Prisma.JsonValue;
  toc: Prisma.JsonValue;
  sectionBlocks: Prisma.JsonValue;
  sourceRecordId: string | null;
  sourceTaskId: string | null;
  sourceProjectId: string | null;
  generationRunId: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  sourceRefs: PrismaKnowledgeSourceReference[];
  item: PrismaKnowledgeItemWithVersion;
};

type PrismaGenerationProfile = {
  id: string;
  name: string;
  version: number;
  state: string;
  sourceBucketRules: Prisma.JsonValue;
  tocTemplate: Prisma.JsonValue;
  ontologySchema: Prisma.JsonValue;
  citationRules: Prisma.JsonValue;
  sectionRules: Prisma.JsonValue;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

function toSourceRef(source: PrismaKnowledgeSourceReference): KnowledgeSourceRef {
  return {
    id: source.sourceRefId || source.id,
    sourceKind: normalizeSourceKind(source.sourceKind),
    sourceId: source.sourceId,
    title: source.title,
    locator: source.locator,
    excerpt: source.excerpt,
    sourceUrl: source.sourceUrl,
    digest: source.digest,
    authorityRank: source.authorityRank,
    verifiedAt: source.verifiedAt?.toISOString() ?? null,
    stale: source.stale,
    legalChangeWarnings: asStringArray(source.legalChangeWarnings),
    allowedUse: normalizeAllowedUse(source.allowedUse),
  };
}

function toDraft(version: PrismaKnowledgeItemVersionWithRelations): StructuredKnowledgeDraft {
  const rawDraft = asRecord(version.structuredDraft);
  const fallbackOntology: KnowledgeOntologyNode = {
    conceptId: version.item.publicId,
    label: version.item.title,
    category: "reference",
    scope:
      version.item.scope === "organization" ||
      version.item.scope === "project" ||
      version.item.scope === "project_members" ||
      version.item.scope === "admin_only"
        ? version.item.scope
        : "project",
    relations: [],
  };

  return {
    title: typeof rawDraft.title === "string" && rawDraft.title ? rawDraft.title : version.title,
    slug: typeof rawDraft.slug === "string" && rawDraft.slug ? rawDraft.slug : version.item.slug,
    summary: typeof rawDraft.summary === "string" ? rawDraft.summary : version.summary,
    tags: Array.isArray(rawDraft.tags) ? asStringArray(rawDraft.tags) : asStringArray(version.item.tags),
    ontology: normalizeOntology(rawDraft.ontology ?? version.item.ontology, fallbackOntology),
    toc: asToc(rawDraft.toc ?? version.toc),
    sections: asSections(rawDraft.sections ?? version.sectionBlocks),
    reasoningSummary: typeof rawDraft.reasoningSummary === "string" ? rawDraft.reasoningSummary : "",
    claimEvidenceMatrix: Array.isArray(rawDraft.claimEvidenceMatrix)
      ? (rawDraft.claimEvidenceMatrix as StructuredKnowledgeDraft["claimEvidenceMatrix"])
      : [],
    approvalReadiness:
      rawDraft.approvalReadiness &&
      typeof rawDraft.approvalReadiness === "object" &&
      !Array.isArray(rawDraft.approvalReadiness)
        ? (rawDraft.approvalReadiness as StructuredKnowledgeDraft["approvalReadiness"])
        : { status: "ready", issues: [] },
    sourceRefs: version.sourceRefs.map(toSourceRef),
    markdown: typeof rawDraft.markdown === "string" && rawDraft.markdown ? rawDraft.markdown : version.bodyMarkdown,
    warnings: Array.isArray(rawDraft.warnings) ? asStringArray(rawDraft.warnings) : [],
  };
}

function normalizePublicationScope(value: unknown): ApprovedKnowledgeItem["scope"] {
  return value === "admin_only" || value === "organization" || value === "project_members" || value === "project"
    ? value
    : "project_members";
}

function resolveKnowledgeItemProjectId(
  draft: StructuredKnowledgeDraft,
  sourceProjectId: string | null,
  currentProjectId: string | null,
) {
  return normalizePublicationScope(draft.ontology.scope) === "organization"
    ? null
    : sourceProjectId ?? currentProjectId;
}

function toApprovedKnowledgeItem(version: PrismaKnowledgeItemVersionWithRelations): ApprovedKnowledgeItem {
  const draft = toDraft(version);
  return {
    id: version.item.publicId,
    title: draft.title,
    summary: draft.summary,
    bodyMarkdown: version.bodyMarkdown,
    tags: draft.tags,
    scope: normalizePublicationScope(version.item.scope),
    sourceRecordId: version.sourceRecordId ?? version.item.publicId,
    sourceTaskId: version.sourceTaskId ?? "",
    sourceProjectId: version.sourceProjectId ?? version.item.projectId ?? "",
    sourceReferences: toApprovedKnowledgeSourceReferences(version.sourceRefs.map(toSourceRef)),
    structuredKnowledgeItemId: version.itemId,
    structuredKnowledgeVersionId: version.id,
    ...(version.generationRunId ? { generationRunId: version.generationRunId } : {}),
    approvedBy: version.approvedBy ?? "",
    approvedAt: version.approvedAt?.toISOString() ?? version.createdAt.toISOString(),
  };
}

function toGenerationProfile(profile: PrismaGenerationProfile): KnowledgeGenerationProfile {
  return {
    id: profile.id,
    name: profile.name,
    version: profile.version,
    state: profile.state as KnowledgeGenerationProfile["state"],
    sourceBucketRules: profile.sourceBucketRules as KnowledgeGenerationProfile["sourceBucketRules"],
    tocTemplate: asToc(profile.tocTemplate),
    ontologySchema: asRecord(profile.ontologySchema),
    citationRules: asStringArray(profile.citationRules),
    sectionRules: asStringArray(profile.sectionRules),
    createdBy: profile.createdBy,
    updatedBy: profile.updatedBy,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    archivedAt: profile.archivedAt?.toISOString() ?? null,
  };
}

class PostgresStructuredKnowledgeRepository implements StructuredKnowledgeRepository {
  async createItem(input: CreateKnowledgeItemInput) {
    const item = await prisma.knowledgeItem.create({
      data: {
        publicId: input.publicId,
        projectId: input.projectId,
        state: "draft",
        title: input.title,
        slug: input.slug,
        scope: input.scope,
        tags: toInputJson(input.tags),
        ontology: toInputJson(input.ontology),
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
      select: { id: true, publicId: true },
    });

    return item;
  }

  async publishVersion(input: PublishKnowledgeVersionInput) {
    const result = await prisma.$transaction(async (tx) => {
      const currentItem = await tx.knowledgeItem.findUnique({
        where: { id: input.itemId },
        select: { projectId: true },
      });
      if (!currentItem) {
        throw new Error("Knowledge item not found");
      }
      const latest = await tx.knowledgeItemVersion.findFirst({
        where: { itemId: input.itemId },
        orderBy: { version: "desc" },
      });
      const latestApproved = await tx.knowledgeItemVersion.findFirst({
        where: { itemId: input.itemId, state: "approved" },
        orderBy: { version: "desc" },
        select: { id: true },
      });
      const version = (latest?.version ?? 0) + 1;
      await tx.knowledgeItemVersion.updateMany({
        where: { itemId: input.itemId, state: "approved" },
        data: { state: "superseded" },
      });
      const created = await tx.knowledgeItemVersion.create({
        data: {
          itemId: input.itemId,
          version,
          state: "approved",
          title: input.title,
          summary: input.summary,
          bodyMarkdown: input.bodyMarkdown,
          structuredDraft: toInputJson(input.structuredDraft),
          toc: toInputJson(input.toc),
          sectionBlocks: toInputJson(input.sectionBlocks),
          contentDigest: createDigest(input.bodyMarkdown),
          sourceDigest: createDigest(JSON.stringify(input.sourceRefs)),
          sourceRecordId: input.sourceRecordId,
          sourceTaskId: input.sourceTaskId,
          sourceProjectId: input.sourceProjectId,
          generationRunId: input.generationRunId,
          approvedBy: input.approvedBy,
          approvedAt: new Date(),
          supersedesId: latestApproved?.id ?? null,
        },
        select: { id: true },
      });
      await tx.knowledgeSourceReference.createMany({
        data: input.sourceRefs.map((source) => ({
          sourceRefId: source.id,
          itemId: input.itemId,
          versionId: created.id,
          sourceKind: source.sourceKind,
          sourceId: source.sourceId,
          title: source.title,
          locator: source.locator,
          excerpt: source.excerpt,
          sourceUrl: source.sourceUrl,
          digest: source.digest,
          authorityRank: source.authorityRank,
          verifiedAt: source.verifiedAt ? new Date(source.verifiedAt) : null,
          stale: source.stale,
          legalChangeWarnings: toInputJson(source.legalChangeWarnings),
          allowedUse: source.allowedUse,
        })),
      });
      await tx.knowledgeItem.update({
        where: { id: input.itemId },
        data: {
          state: "active",
          projectId: resolveKnowledgeItemProjectId(input.structuredDraft, input.sourceProjectId, currentItem.projectId),
          title: input.structuredDraft.title || input.title,
          slug: input.structuredDraft.slug,
          scope: normalizePublicationScope(input.structuredDraft.ontology.scope),
          tags: toInputJson(input.structuredDraft.tags),
          ontology: toInputJson(input.structuredDraft.ontology),
          updatedBy: input.approvedBy,
        },
      });
      return { itemId: input.itemId, versionId: created.id, version };
    });

    return result;
  }

  private async listApprovedVersions(input: { projectId: string }) {
    const versions = await prisma.knowledgeItemVersion.findMany({
      where: {
        state: "approved",
        item: {
          state: "active",
          OR: [{ projectId: input.projectId }, { scope: "organization" }],
        },
      },
      include: {
        item: true,
        sourceRefs: true,
      },
      orderBy: [{ approvedAt: "desc" }, { version: "desc" }, { createdAt: "desc" }],
    });

    const seenItemIds = new Set<string>();
    return (versions as unknown as PrismaKnowledgeItemVersionWithRelations[]).filter((version) => {
      if (seenItemIds.has(version.itemId)) {
        return false;
      }
      seenItemIds.add(version.itemId);
      return true;
    });
  }

  async listApprovedItems(input: { projectId: string }) {
    const latestVersions = await this.listApprovedVersions(input);

    return latestVersions.map(toDraft);
  }

  async listApprovedKnowledgeItems(input: { projectId: string }) {
    const latestVersions = await this.listApprovedVersions(input);

    return latestVersions.map(toApprovedKnowledgeItem);
  }

  async searchApprovedKnowledge(input: { projectId: string; query: string; limit?: number }) {
    const limit = Math.max(0, input.limit ?? 4);
    if (limit === 0) {
      return [];
    }

    return rankApprovedKnowledge(await this.listApprovedKnowledgeItems({ projectId: input.projectId }), input.query).slice(0, limit);
  }

  async getActiveGenerationProfile(name: string) {
    const profile = await prisma.knowledgeGenerationProfile.findFirst({
      where: { name, state: "active" },
      orderBy: { version: "desc" },
    });

    return profile ? toGenerationProfile(profile as unknown as PrismaGenerationProfile) : null;
  }
}

export const postgresStructuredKnowledgeRepository = new PostgresStructuredKnowledgeRepository();

function rankApprovedKnowledge(items: ApprovedKnowledgeItem[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length >= 2);
  return items
    .map((item) => ({
      item,
      score: scoreApprovedKnowledge(item, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.item.approvedAt.localeCompare(left.item.approvedAt))
    .map((entry) => entry.item);
}

function scoreApprovedKnowledge(item: ApprovedKnowledgeItem, terms: string[]) {
  const haystack = `${item.title} ${item.summary} ${item.bodyMarkdown} ${item.tags.join(" ")}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
