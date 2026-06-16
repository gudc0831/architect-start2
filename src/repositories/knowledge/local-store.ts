import { createHash, randomUUID } from "node:crypto";
import type { ApprovedKnowledgeItem } from "@/domains/assistant/types";
import type {
  KnowledgeGenerationProfile,
  KnowledgeSourceRef,
  StructuredKnowledgeDraft,
} from "@/domains/knowledge/structured-knowledge";
import type {
  CreateKnowledgeItemInput,
  PublishKnowledgeVersionInput,
  StructuredKnowledgeRepository,
} from "@/repositories/knowledge/contracts";
import { toApprovedKnowledgeSourceReferences } from "@/use-cases/admin/structured-knowledge-service";

type LocalKnowledgeItem = {
  id: string;
  publicId: string;
  projectId: string | null;
  state: "draft" | "active" | "archived";
  title: string;
  slug: string;
  scope: string;
  tags: string[];
  ontology: StructuredKnowledgeDraft["ontology"];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

type LocalKnowledgeVersion = {
  id: string;
  itemId: string;
  version: number;
  state: "approved" | "superseded";
  title: string;
  summary: string;
  bodyMarkdown: string;
  structuredDraft: StructuredKnowledgeDraft;
  toc: StructuredKnowledgeDraft["toc"];
  sectionBlocks: StructuredKnowledgeDraft["sections"];
  contentDigest: string;
  sourceDigest: string;
  sourceRecordId: string | null;
  sourceTaskId: string | null;
  sourceProjectId: string | null;
  generationRunId: string | null;
  approvedBy: string;
  approvedAt: string;
  supersedesId: string | null;
  createdAt: string;
};

type LocalKnowledgeSourceReference = KnowledgeSourceRef & {
  itemId: string;
  versionId: string;
  createdAt: string;
};

type LocalKnowledgeStore = {
  items: LocalKnowledgeItem[];
  versions: LocalKnowledgeVersion[];
  sourceRefs: LocalKnowledgeSourceReference[];
  profiles: KnowledgeGenerationProfile[];
};

const localKnowledgeStore: LocalKnowledgeStore = {
  items: [],
  versions: [],
  sourceRefs: [],
  profiles: [],
};

function nowIso() {
  return new Date().toISOString();
}

function createDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cloneDraft(draft: StructuredKnowledgeDraft): StructuredKnowledgeDraft {
  return JSON.parse(JSON.stringify(draft)) as StructuredKnowledgeDraft;
}

function cloneSourceRef(source: KnowledgeSourceRef): KnowledgeSourceRef {
  return JSON.parse(JSON.stringify(source)) as KnowledgeSourceRef;
}

function sourceRefsForVersion(version: LocalKnowledgeVersion): KnowledgeSourceRef[] {
  return localKnowledgeStore.sourceRefs
    .filter((source) => source.versionId === version.id)
    .map(({ itemId: _itemId, versionId: _versionId, createdAt: _createdAt, ...source }) => cloneSourceRef(source));
}

function draftForVersion(version: LocalKnowledgeVersion, item: LocalKnowledgeItem): StructuredKnowledgeDraft {
  return {
    ...cloneDraft(version.structuredDraft),
    title: version.structuredDraft.title || version.title,
    slug: version.structuredDraft.slug || item.slug,
    summary: version.structuredDraft.summary || version.summary,
    tags: [...version.structuredDraft.tags],
    toc: [...version.toc],
    sections: [...version.sectionBlocks],
    sourceRefs: sourceRefsForVersion(version),
    markdown: version.structuredDraft.markdown || version.bodyMarkdown,
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

function approvedKnowledgeItemForVersion(version: LocalKnowledgeVersion, item: LocalKnowledgeItem): ApprovedKnowledgeItem {
  const draft = draftForVersion(version, item);
  return {
    id: item.publicId,
    title: draft.title,
    summary: draft.summary,
    bodyMarkdown: version.bodyMarkdown,
    tags: draft.tags,
    scope: normalizePublicationScope(item.scope),
    sourceRecordId: version.sourceRecordId ?? item.publicId,
    sourceTaskId: version.sourceTaskId ?? "",
    sourceProjectId: version.sourceProjectId ?? item.projectId ?? "",
    sourceReferences: toApprovedKnowledgeSourceReferences(sourceRefsForVersion(version)),
    structuredKnowledgeItemId: item.id,
    structuredKnowledgeVersionId: version.id,
    ...(version.generationRunId ? { generationRunId: version.generationRunId } : {}),
    approvedBy: version.approvedBy,
    approvedAt: version.approvedAt,
  };
}

class LocalStructuredKnowledgeRepository implements StructuredKnowledgeRepository {
  async createItem(input: CreateKnowledgeItemInput) {
    const timestamp = nowIso();
    const item: LocalKnowledgeItem = {
      id: randomUUID(),
      publicId: input.publicId,
      projectId: input.projectId,
      state: "draft",
      title: input.title,
      slug: input.slug,
      scope: input.scope,
      tags: [...input.tags],
      ontology: JSON.parse(JSON.stringify(input.ontology)) as StructuredKnowledgeDraft["ontology"],
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    localKnowledgeStore.items = [item, ...localKnowledgeStore.items];
    return { id: item.id, publicId: item.publicId };
  }

  async publishVersion(input: PublishKnowledgeVersionInput) {
    const currentItem = localKnowledgeStore.items.find((item) => item.id === input.itemId);
    if (!currentItem) {
      throw new Error("Knowledge item not found");
    }

    const timestamp = nowIso();
    const latest = localKnowledgeStore.versions
      .filter((version) => version.itemId === input.itemId)
      .sort((left, right) => right.version - left.version)[0];
    const latestApproved = localKnowledgeStore.versions
      .filter((itemVersion) => itemVersion.itemId === input.itemId && itemVersion.state === "approved")
      .sort((left, right) => right.version - left.version)[0];
    const version = (latest?.version ?? 0) + 1;
    const created: LocalKnowledgeVersion = {
      id: randomUUID(),
      itemId: input.itemId,
      version,
      state: "approved",
      title: input.title,
      summary: input.summary,
      bodyMarkdown: input.bodyMarkdown,
      structuredDraft: cloneDraft(input.structuredDraft),
      toc: [...input.toc],
      sectionBlocks: [...input.sectionBlocks],
      contentDigest: createDigest(input.bodyMarkdown),
      sourceDigest: createDigest(JSON.stringify(input.sourceRefs)),
      sourceRecordId: input.sourceRecordId,
      sourceTaskId: input.sourceTaskId,
      sourceProjectId: input.sourceProjectId,
      generationRunId: input.generationRunId,
      approvedBy: input.approvedBy,
      approvedAt: timestamp,
      supersedesId: latestApproved?.id ?? null,
      createdAt: timestamp,
    };
    const nextSourceRefs = input.sourceRefs.map((source) => ({
      ...cloneSourceRef(source),
      id: source.id || randomUUID(),
      itemId: input.itemId,
      versionId: created.id,
      createdAt: timestamp,
    }));

    localKnowledgeStore.versions = [
      created,
      ...localKnowledgeStore.versions.map((itemVersion) =>
        itemVersion.itemId === input.itemId && itemVersion.state === "approved"
          ? { ...itemVersion, state: "superseded" as const }
          : itemVersion,
      ),
    ];
    localKnowledgeStore.sourceRefs = [...nextSourceRefs, ...localKnowledgeStore.sourceRefs];
    localKnowledgeStore.items = localKnowledgeStore.items.map((item) =>
      item.id === input.itemId
        ? {
            ...item,
            state: "active",
            projectId: resolveKnowledgeItemProjectId(input.structuredDraft, input.sourceProjectId, item.projectId),
            title: input.structuredDraft.title || input.title,
            slug: input.structuredDraft.slug,
            scope: normalizePublicationScope(input.structuredDraft.ontology.scope),
            tags: [...input.structuredDraft.tags],
            ontology: JSON.parse(JSON.stringify(input.structuredDraft.ontology)) as StructuredKnowledgeDraft["ontology"],
            updatedBy: input.approvedBy,
            updatedAt: timestamp,
          }
        : item,
    );

    return { itemId: input.itemId, versionId: created.id, version };
  }

  private listApprovedKnowledgeItemEntries(input: { projectId: string }) {
    const activeItems = localKnowledgeStore.items.filter(
      (item) => item.state === "active" && (item.projectId === input.projectId || item.scope === "organization"),
    );
    const entries: Array<{ item: LocalKnowledgeItem; version: LocalKnowledgeVersion }> = [];

    for (const item of activeItems) {
      const latest = localKnowledgeStore.versions
        .filter((version) => version.itemId === item.id && version.state === "approved")
        .sort((left, right) => right.version - left.version)[0];
      if (latest) {
        entries.push({ item, version: latest });
      }
    }

    return entries.sort(
      (left, right) =>
        right.version.approvedAt.localeCompare(left.version.approvedAt) ||
        right.version.createdAt.localeCompare(left.version.createdAt) ||
        right.version.version - left.version.version,
    );
  }

  async listApprovedItems(input: { projectId: string }) {
    return this.listApprovedKnowledgeItemEntries(input).map(({ item, version }) => draftForVersion(version, item));
  }

  async listApprovedKnowledgeItems(input: { projectId: string }) {
    return this.listApprovedKnowledgeItemEntries(input).map(({ item, version }) => approvedKnowledgeItemForVersion(version, item));
  }

  async searchApprovedKnowledge(input: { projectId: string; query: string; limit?: number }) {
    const limit = Math.max(0, input.limit ?? 4);
    if (limit === 0) {
      return [];
    }

    return rankApprovedKnowledge(await this.listApprovedKnowledgeItems({ projectId: input.projectId }), input.query).slice(0, limit);
  }

  async getActiveGenerationProfile(name: string) {
    return (
      localKnowledgeStore.profiles
        .filter((profile) => profile.name === name && profile.state === "active")
        .sort((left, right) => right.version - left.version)[0] ?? null
    );
  }
}

export const localStructuredKnowledgeRepository = new LocalStructuredKnowledgeRepository();

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
