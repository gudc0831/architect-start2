import type {
  KnowledgeGenerationProfile,
  KnowledgeSourceRef,
  StructuredKnowledgeDraft,
} from "@/domains/knowledge/structured-knowledge";
import type { ApprovedKnowledgeItem } from "@/domains/assistant/types";

export type CreateKnowledgeItemInput = {
  publicId: string;
  projectId: string | null;
  title: string;
  slug: string;
  scope: string;
  tags: string[];
  ontology: StructuredKnowledgeDraft["ontology"];
  createdBy: string;
};

export type PublishKnowledgeVersionInput = {
  itemId: string;
  sourceRecordId: string | null;
  sourceTaskId: string | null;
  sourceProjectId: string | null;
  title: string;
  summary: string;
  bodyMarkdown: string;
  structuredDraft: StructuredKnowledgeDraft;
  toc: StructuredKnowledgeDraft["toc"];
  sectionBlocks: StructuredKnowledgeDraft["sections"];
  sourceRefs: KnowledgeSourceRef[];
  generationRunId: string | null;
  approvedBy: string;
};

export type StructuredKnowledgeRepository = {
  createItem(input: CreateKnowledgeItemInput): Promise<{ id: string; publicId: string }>;
  publishVersion(input: PublishKnowledgeVersionInput): Promise<{ itemId: string; versionId: string; version: number }>;
  listApprovedItems(input: { projectId: string }): Promise<StructuredKnowledgeDraft[]>;
  listApprovedKnowledgeItems(input: { projectId: string }): Promise<ApprovedKnowledgeItem[]>;
  searchApprovedKnowledge(input: { projectId: string; query: string; limit?: number }): Promise<ApprovedKnowledgeItem[]>;
  getActiveGenerationProfile(name: string): Promise<KnowledgeGenerationProfile | null>;
};
